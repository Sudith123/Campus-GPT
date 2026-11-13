import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/schema';
import { calculateAttendanceMetrics } from '../../src/lib/academicMath';

export interface AuthUser {
  id: number;
  roleId: number;
  roleName: 'student' | 'teacher' | 'admin';
  fullName: string;
  email: string;
  collegeId: string;
  status: string;
  emailVerified: boolean;
  preferredLanguage: 'English' | 'Kannada' | 'Hindi';
  notificationPrefs: Record<string, boolean>;
  phone: string | null;
  isDemo: boolean;
  studentId?: number;
  teacherId?: number;
  departmentId?: number;
  departmentCode?: string;
  departmentName?: string;
  semester?: number;
  section?: string;
  cgpa?: number;
  activeBacklogs?: number;
  designation?: string;
  canPublishResults?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      sessionTokenHash?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'campusgpt_session';

export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET || 'campusgpt-dev-session-secret-key';
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function createSession(userId: number, req: Request): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, tokenHash, expiresAt, req.ip || 'unknown', req.get('user-agent') || 'unknown');

  return rawToken;
}

export function loadUserById(userId: number): AuthUser | null {
  const row = db
    .prepare(
      `
      SELECT u.*, r.name as role_name
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `
    )
    .get(userId) as any;

  if (!row) return null;

  let notificationPrefs: Record<string, boolean> = {};
  try {
    notificationPrefs = JSON.parse(row.notification_prefs || '{}');
  } catch {
    notificationPrefs = {};
  }

  const base: AuthUser = {
    id: row.id,
    roleId: row.role_id,
    roleName: row.role_name,
    fullName: row.full_name,
    email: row.email,
    collegeId: row.college_id,
    status: row.status,
    emailVerified: Boolean(row.email_verified),
    preferredLanguage: row.preferred_language || 'English',
    notificationPrefs,
    phone: row.phone,
    isDemo: Boolean(row.is_demo),
  };

  if (row.role_name === 'student') {
    const stu = db
      .prepare(
        `
        SELECT s.*, d.code as dept_code, d.name as dept_name
        FROM students s
        JOIN departments d ON d.id = s.department_id
        WHERE s.user_id = ?
      `
      )
      .get(row.id) as any;
    if (stu) {
      base.studentId = stu.id;
      base.departmentId = stu.department_id;
      base.departmentCode = stu.dept_code;
      base.departmentName = stu.dept_name;
      base.semester = stu.semester;
      base.section = stu.section;
      base.cgpa = stu.cgpa;
      base.activeBacklogs = stu.active_backlogs;
    }
  } else if (row.role_name === 'teacher') {
    const tea = db
      .prepare(
        `
        SELECT t.*, d.code as dept_code, d.name as dept_name
        FROM teachers t
        JOIN departments d ON d.id = t.department_id
        WHERE t.user_id = ?
      `
      )
      .get(row.id) as any;
    if (tea) {
      base.teacherId = tea.id;
      base.departmentId = tea.department_id;
      base.departmentCode = tea.dept_code;
      base.departmentName = tea.dept_name;
      base.designation = tea.designation;
      base.canPublishResults = Boolean(tea.can_publish_results);
    }
  }

  return base;
}

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.get('authorization');
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch ? bearerMatch[1].trim() : null;
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] || null;
  return bearerToken || cookieToken;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const rawToken = extractAuthToken(req);

  if (!rawToken) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const tokenHash = hashToken(rawToken);
  const session = db
    .prepare(
      `
      SELECT * FROM auth_sessions
      WHERE token_hash = ? AND datetime(expires_at) > datetime('now')
    `
    )
    .get(tokenHash) as any;

  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }

  const user = loadUserById(session.user_id);
  if (!user || user.status !== 'active') {
    return res.status(403).json({ error: 'Account is inactive or pending verification.' });
  }

  req.authUser = user;
  req.sessionTokenHash = tokenHash;
  next();
}

export function requireRole(allowedRoles: Array<'student' | 'teacher' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.authUser.roleName)) {
      return res.status(403).json({ error: `Access restricted to ${allowedRoles.join(' or ')} accounts.` });
    }
    next();
  };
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(keyPrefix: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${req.ip || 'local'}`;
    const now = Date.now();
    const bucket = rateBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      const retrySec = Math.ceil((bucket.resetAt - now) / 1000);
      return res.status(429).json({
        error: `Too many requests. Please try again in ${retrySec} seconds.`,
      });
    }

    bucket.count += 1;
    next();
  };
}

export function recordAuditLog(
  actorUserId: number | null,
  actorEmail: string | null,
  action: string,
  entityType: string,
  entityId: string | number | null,
  details: string,
  ipAddress?: string
) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, actor_email, action, entity_type, entity_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actorUserId,
    actorEmail,
    action,
    entityType,
    entityId != null ? String(entityId) : null,
    details,
    ipAddress || '127.0.0.1'
  );
}

export function getRequiredAttendancePct(): number {
  const row = db
    .prepare(`SELECT value FROM institutional_settings WHERE key = 'required_attendance_pct'`)
    .get() as { value: string } | undefined;
  return row ? Number(row.value) || 75 : 75;
}

export function syncSessionNotifications(user: AuthUser) {
  if (user.roleName !== 'student' || !user.studentId) return;

  const reqPct = getRequiredAttendancePct();
  const prefs = user.notificationPrefs || {};

  // Check attendance shortage dynamically
  if (prefs.attendance !== false) {
    const attRows = db
      .prepare(
        `
        SELECT sub.code, sub.name,
               SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as attended,
               COUNT(*) as conducted
        FROM enrollments e
        JOIN subjects sub ON sub.id = e.subject_id
        LEFT JOIN attendance a ON a.student_id = e.student_id AND a.subject_id = e.subject_id
        WHERE e.student_id = ?
        GROUP BY sub.id
      `
      )
      .all(user.studentId) as any[];

    for (const r of attRows) {
      if (r.conducted > 0) {
        const calc = calculateAttendanceMetrics(r.attended, r.conducted, reqPct);
        if (calc.status === 'shortage') {
          const title = `Attendance Shortage Alert: ${r.code}`;
          const exists = db
            .prepare(`SELECT id FROM notifications WHERE user_id = ? AND title = ? AND is_read = 0`)
            .get(user.id, title);
          if (!exists) {
            db.prepare(
              `INSERT INTO notifications (user_id, type, title, message, source_mode) VALUES (?, 'attendance', ?, ?, 'session_generated')`
            ).run(
              user.id,
              title,
              `Your attendance in ${r.name} (${r.code}) is ${calc.currentPercentage}%, below the ${reqPct}% requirement.`
            );
          }
        }
      }
    }
  }
}
