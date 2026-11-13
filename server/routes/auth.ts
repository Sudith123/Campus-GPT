import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/schema';
import {
  createSession,
  extractAuthToken,
  hashToken,
  loadUserById,
  rateLimit,
  recordAuditLog,
  requireAuth,
  SESSION_COOKIE_NAME,
  syncSessionNotifications,
} from '../middleware/auth';

export const authRouter = Router();

function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getSessionCookieOptions(req: { secure: boolean; get: (name: string) => string | undefined }) {
  const isHttps = req.secure || req.get('x-forwarded-proto') === 'https';
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  };
}

authRouter.get('/departments', (_req, res) => {
  const departments = db.prepare('SELECT id, code, name, head_name FROM departments ORDER BY code').all();
  res.json({ departments });
});

authRouter.get('/me', (req, res) => {
  const rawToken = extractAuthToken(req);

  const instRow = db.prepare(`SELECT value FROM institutional_settings WHERE key = 'institution_name'`).get() as
    | { value: string }
    | undefined;
  const reqAttRow = db.prepare(`SELECT value FROM institutional_settings WHERE key = 'required_attendance_pct'`).get() as
    | { value: string }
    | undefined;

  const meta = {
    institutionName: instRow?.value || 'Meridian Institute of Technology (Demo Institution)',
    requiredAttendancePct: Number(reqAttRow?.value || 75),
    smtpConfigured: isSmtpConfigured(),
    allowedCollegeDomain: process.env.ALLOWED_COLLEGE_DOMAIN || 'meridian.edu.in',
  };

  if (!rawToken) {
    return res.json({ user: null, meta });
  }

  const tokenHash = hashToken(rawToken);
  const session = db
    .prepare(`SELECT * FROM auth_sessions WHERE token_hash = ? AND datetime(expires_at) > datetime('now')`)
    .get(tokenHash) as any;

  if (!session) {
    return res.json({ user: null, meta });
  }

  const user = loadUserById(session.user_id);
  if (!user || user.status !== 'active') {
    return res.json({ user: null, meta });
  }

  syncSessionNotifications(user);
  res.json({ user, meta });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post('/login', rateLimit('login', 15, 60_000), (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please provide a valid email address and password.' });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const userRow = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email) as any;

  if (!userRow || !bcrypt.compareSync(parsed.data.password, userRow.password_hash)) {
    recordAuditLog(null, email, 'LOGIN_FAILED', 'auth', null, 'Invalid credentials', req.ip);
    return res.status(401).json({ error: 'Invalid college email or password.' });
  }

  if (userRow.status === 'inactive') {
    return res.status(403).json({ error: 'Your account has been deactivated by an administrator.' });
  }

  if (userRow.status === 'pending_verification') {
    return res.status(403).json({
      error: 'Your email address is pending verification.',
      requiresVerification: true,
      email: userRow.email,
    });
  }

  const token = createSession(userRow.id, req);
  const user = loadUserById(userRow.id)!;
  syncSessionNotifications(user);
  recordAuditLog(user.id, user.email, 'LOGIN_SUCCESS', 'auth', user.id, `Role: ${user.roleName}`, req.ip);

  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(req));

  res.json({ user, token });
});

const registerSchema = z
  .object({
    fullName: z.string().min(2).max(100),
    collegeId: z.string().min(3).max(40),
    email: z.string().email(),
    departmentId: z.coerce.number().int().positive(),
    semester: z.coerce.number().int().min(1).max(8).optional(),
    password: z.string().min(8).max(100),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

authRouter.post('/register', rateLimit('register', 10, 60_000), (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration input.' });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const collegeId = parsed.data.collegeId.trim().toUpperCase();

  // Enforce authorized college roster approval
  const roster = db
    .prepare(
      `
      SELECT * FROM roster_approvals
      WHERE lower(email) = ? AND upper(college_id) = ? AND claimed = 0
    `
    )
    .get(email, collegeId) as any;

  if (!roster) {
    return res.status(403).json({
      error:
        'Registration denied: Your email and Student/Employee ID must match an approved entry on the institutional roster. Contact your administrator.',
    });
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE lower(email) = ? OR upper(college_id) = ?')
    .get(email, collegeId);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email or college ID already exists.' });
  }

  const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(roster.role_name) as { id: number };
  const passwordHash = bcrypt.hashSync(parsed.data.password, 10);
  const smtpReady = isSmtpConfigured();

  const createAccount = db.transaction(() => {
    const status = smtpReady ? 'pending_verification' : 'active';
    const emailVerified = smtpReady ? 0 : 1;

    const uRes = db
      .prepare(
        `
        INSERT INTO users (role_id, full_name, email, college_id, password_hash, status, email_verified, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `
      )
      .run(roleRow.id, parsed.data.fullName.trim(), email, collegeId, passwordHash, status, emailVerified);

    const userId = Number(uRes.lastInsertRowid);

    if (roster.role_name === 'student') {
      const deptId = roster.department_id || parsed.data.departmentId;
      const sem = roster.semester || parsed.data.semester || 1;
      const sRes = db
        .prepare(
          `
          INSERT INTO students (user_id, department_id, semester, academic_year, section, cgpa, active_backlogs)
          VALUES (?, ?, ?, '2026-27', 'A', 0.0, 0)
        `
        )
        .run(userId, deptId, sem);
      const studentId = Number(sRes.lastInsertRowid);

      // Enroll student in department semester subjects
      const subjects = db
        .prepare('SELECT id FROM subjects WHERE department_id = ? AND semester = ?')
        .all(deptId, sem) as Array<{ id: number }>;
      const enrollStmt = db.prepare(
        `INSERT OR IGNORE INTO enrollments (student_id, subject_id, academic_year) VALUES (?, ?, '2026-27')`
      );
      for (const s of subjects) {
        enrollStmt.run(studentId, s.id);
      }
    } else if (roster.role_name === 'teacher') {
      db.prepare(
        `INSERT INTO teachers (user_id, department_id, designation) VALUES (?, ?, 'Assistant Professor')`
      ).run(userId, roster.department_id || parsed.data.departmentId);
    }

    db.prepare('UPDATE roster_approvals SET claimed = 1 WHERE id = ?').run(roster.id);
    recordAuditLog(userId, email, 'USER_REGISTERED', 'users', userId, `Roster-verified ${roster.role_name} registration`, req.ip);
    return userId;
  });

  const newUserId = createAccount();

  if (smtpReady) {
    return res.status(201).json({
      requiresVerification: true,
      email,
      message: 'Account created. Please request and verify the 6-digit email OTP to activate your account.',
    });
  }

  const token = createSession(newUserId, req);
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(req));

  const user = loadUserById(newUserId);
  res.status(201).json({
    user,
    token,
    requiresVerification: false,
    message: 'Roster-verified account created and activated (SMTP OTP delivery is not configured in this environment).',
  });
});

const otpRequestSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['email_verification', 'password_reset']),
});

authRouter.post('/otp/request', rateLimit('otp-request', 3, 60_000), (req, res) => {
  const parsed = otpRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email and OTP purpose required.' });
  }

  if (!isSmtpConfigured()) {
    return res.status(501).json({
      error:
        'Email OTP delivery is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS are missing). CampusGPT does not fake OTP delivery.',
      smtpConfigured: false,
    });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (!user) {
    // Generic message to prevent user enumeration
    return res.json({ message: 'If an eligible account exists, a 6-digit OTP has been dispatched.' });
  }

  const otp = String(crypto.randomInt(100000, 999999));
  const otpHash = hashToken(`${email}:${parsed.data.purpose}:${otp}`);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  db.prepare('UPDATE otp_tokens SET used = 1 WHERE lower(email) = ? AND purpose = ? AND used = 0').run(
    email,
    parsed.data.purpose
  );
  db.prepare('INSERT INTO otp_tokens (email, purpose, otp_hash, expires_at) VALUES (?, ?, ?, ?)').run(
    email,
    parsed.data.purpose,
    otpHash,
    expiresAt
  );

  // Note: Never log actual OTP. Real nodemailer transport goes here when SMTP is configured.
  res.json({ message: 'If an eligible account exists, a 6-digit OTP valid for 5 minutes has been sent.' });
});

const otpVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  purpose: z.enum(['email_verification', 'password_reset']),
  newPassword: z.string().min(8).optional(),
});

authRouter.post('/otp/verify', rateLimit('otp-verify', 8, 60_000), (req, res) => {
  const parsed = otpVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid OTP verification payload.' });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const tokenRow = db
    .prepare(
      `
      SELECT * FROM otp_tokens
      WHERE lower(email) = ? AND purpose = ? AND used = 0 AND datetime(expires_at) > datetime('now')
      ORDER BY id DESC LIMIT 1
    `
    )
    .get(email, parsed.data.purpose) as any;

  if (!tokenRow) {
    return res.status(400).json({ error: 'OTP is missing or expired. Please request a new code.' });
  }

  if (tokenRow.attempts >= 5) {
    db.prepare('UPDATE otp_tokens SET used = 1 WHERE id = ?').run(tokenRow.id);
    return res.status(429).json({ error: 'Maximum OTP verification attempts exceeded.' });
  }

  const providedHash = hashToken(`${email}:${parsed.data.purpose}:${parsed.data.otp}`);
  if (providedHash !== tokenRow.otp_hash) {
    db.prepare('UPDATE otp_tokens SET attempts = attempts + 1 WHERE id = ?').run(tokenRow.id);
    return res.status(400).json({ error: 'Incorrect verification code.' });
  }

  db.prepare('UPDATE otp_tokens SET used = 1 WHERE id = ?').run(tokenRow.id);

  if (parsed.data.purpose === 'email_verification') {
    db.prepare(`UPDATE users SET status = 'active', email_verified = 1, updated_at = datetime('now') WHERE lower(email) = ?`).run(
      email
    );
    return res.json({ message: 'Email verified successfully. You may now sign in.' });
  }

  if (!parsed.data.newPassword) {
    return res.status(400).json({ error: 'A new password (min 8 chars) is required.' });
  }

  const newHash = bcrypt.hashSync(parsed.data.newPassword, 10);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE lower(email) = ?`).run(
    newHash,
    email
  );
  res.json({ message: 'Password updated successfully.' });
});

authRouter.post('/logout', (req, res) => {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  const authHeader = req.get('authorization');
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch ? bearerMatch[1].trim() : null;

  for (const rawToken of [cookieToken, bearerToken]) {
    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
    }
  }

  const cookieOpts = getSessionCookieOptions(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: cookieOpts.path,
    sameSite: cookieOpts.sameSite,
    secure: cookieOpts.secure,
  });
  res.json({ message: 'Signed out.' });
});

const prefsSchema = z.object({
  preferredLanguage: z.enum(['English', 'Kannada', 'Hindi']).optional(),
  phone: z.string().max(30).nullable().optional(),
  notificationPrefs: z.record(z.string(), z.boolean()).optional(),
});

authRouter.patch('/preferences', requireAuth, (req, res) => {
  const parsed = prefsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid preferences update.' });
  }

  const user = req.authUser!;
  const lang = parsed.data.preferredLanguage ?? user.preferredLanguage;
  const phone = parsed.data.phone !== undefined ? parsed.data.phone : user.phone;
  const prefs = parsed.data.notificationPrefs ? JSON.stringify(parsed.data.notificationPrefs) : JSON.stringify(user.notificationPrefs);

  db.prepare(
    `UPDATE users SET preferred_language = ?, phone = ?, notification_prefs = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(lang, phone, prefs, user.id);

  const updated = loadUserById(user.id);
  res.json({ user: updated });
});
