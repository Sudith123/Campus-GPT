import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/schema';
import { getRequiredAttendancePct, recordAuditLog, requireAuth, requireRole } from '../middleware/auth';
import { checkTimetableConflict } from '../../src/lib/academicMath';
import { extractPdfPages, indexDocumentChunks } from '../services/gemini';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(['admin']));

const DOCS_DIR = path.resolve(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

const uploadPdf = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOCS_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return cb(new Error('Only PDF documents (.pdf) are allowed.'));
    }
    cb(null, true);
  },
});

adminRouter.get('/overview', (_req, res) => {
  const counts = {
    students: (db.prepare('SELECT COUNT(*) as c FROM students').get() as any).c,
    teachers: (db.prepare('SELECT COUNT(*) as c FROM teachers').get() as any).c,
    departments: (db.prepare('SELECT COUNT(*) as c FROM departments').get() as any).c,
    subjects: (db.prepare('SELECT COUNT(*) as c FROM subjects').get() as any).c,
    activeDrives: (db.prepare("SELECT COUNT(*) as c FROM placement_drives WHERE status = 'open'").get() as any).c,
    publishedAnnouncements: (db.prepare("SELECT COUNT(*) as c FROM announcements WHERE status = 'published'").get() as any).c,
    documentsReady: (db.prepare("SELECT COUNT(*) as c FROM documents WHERE processing_status = 'ready'").get() as any).c,
  };

  const deptStats = db
    .prepare(
      `
      SELECT d.id, d.code, d.name, d.head_name,
             (SELECT COUNT(*) FROM students s WHERE s.department_id = d.id) as student_count,
             (SELECT COUNT(*) FROM teachers t WHERE t.department_id = d.id) as teacher_count,
             (SELECT COUNT(*) FROM subjects sub WHERE sub.department_id = d.id) as subject_count,
             (SELECT ROUND(AVG(s.cgpa), 2) FROM students s WHERE s.department_id = d.id) as avg_cgpa
      FROM departments d
      ORDER BY d.code
    `
    )
    .all();

  const feeTotals = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount_due), 0) as total_due,
             COALESCE((SELECT SUM(amount_paid) FROM fee_payments), 0) as total_paid
      FROM fee_invoices
    `
    )
    .get();

  const settingsRows = db.prepare('SELECT key, value FROM institutional_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

  res.json({ counts, deptStats, feeTotals, settings });
});

adminRouter.patch('/settings', (req, res) => {
  const reqPct = Number(req.body?.required_attendance_pct);
  if (Number.isNaN(reqPct) || reqPct < 50 || reqPct > 95) {
    return res.status(400).json({ error: 'Required attendance percentage must be between 50 and 95.' });
  }
  db.prepare(
    `INSERT INTO institutional_settings (key, value, updated_at) VALUES ('required_attendance_pct', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(String(reqPct));
  recordAuditLog(
    req.authUser!.id,
    req.authUser!.email,
    'POLICY_UPDATED',
    'institutional_settings',
    'required_attendance_pct',
    `Updated required attendance threshold to ${reqPct}%`,
    req.ip
  );
  res.json({ required_attendance_pct: String(reqPct) });
});

// STUDENTS CRUD
adminRouter.get('/students', (_req, res) => {
  const students = db
    .prepare(
      `
      SELECT st.id as student_id, u.id as user_id, u.full_name, u.email, u.college_id, u.status,
             d.id as department_id, d.code as department_code, d.name as department_name,
             st.semester, st.section, st.cgpa, st.active_backlogs, st.academic_year, u.is_demo
      FROM students st
      JOIN users u ON u.id = st.user_id
      JOIN departments d ON d.id = st.department_id
      ORDER BY u.college_id
    `
    )
    .all();
  res.json({ students });
});

adminRouter.post('/students', (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    collegeId: z.string().min(3),
    departmentId: z.coerce.number().int().positive(),
    semester: z.coerce.number().int().min(1).max(8),
    cgpa: z.coerce.number().min(0).max(10).default(7.5),
    password: z.string().min(8).default('Campus@2026'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid student data.' });

  const email = parsed.data.email.trim().toLowerCase();
  const collegeId = parsed.data.collegeId.trim().toUpperCase();
  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ? OR upper(college_id) = ?').get(email, collegeId);
  if (exists) return res.status(409).json({ error: 'Student email or ID already exists.' });

  const roleId = (db.prepare("SELECT id FROM roles WHERE name = 'student'").get() as any).id;
  const hash = bcrypt.hashSync(parsed.data.password, 10);

  const tx = db.transaction(() => {
    const uRes = db
      .prepare(
        `INSERT INTO users (role_id, full_name, email, college_id, password_hash, status, email_verified) VALUES (?, ?, ?, ?, ?, 'active', 1)`
      )
      .run(roleId, parsed.data.fullName.trim(), email, collegeId, hash);
    const sRes = db
      .prepare(
        `INSERT INTO students (user_id, department_id, semester, cgpa, active_backlogs) VALUES (?, ?, ?, ?, 0)`
      )
      .run(Number(uRes.lastInsertRowid), parsed.data.departmentId, parsed.data.semester, parsed.data.cgpa);
    const studentId = Number(sRes.lastInsertRowid);

    const subs = db
      .prepare('SELECT id FROM subjects WHERE department_id = ? AND semester = ?')
      .all(parsed.data.departmentId, parsed.data.semester) as any[];
    const insEnroll = db.prepare('INSERT OR IGNORE INTO enrollments (student_id, subject_id) VALUES (?, ?)');
    for (const s of subs) insEnroll.run(studentId, s.id);
    return studentId;
  });

  const studentId = tx();
  recordAuditLog(req.authUser!.id, req.authUser!.email, 'STUDENT_CREATED', 'student', studentId, `${collegeId} (${email})`, req.ip);
  res.status(201).json({ studentId, message: 'Student created and enrolled in semester subjects.' });
});

adminRouter.patch('/students/:studentId', (req, res) => {
  const studentId = Number(req.params.studentId);
  const stu = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
  if (!stu) return res.status(404).json({ error: 'Student not found.' });

  const { status, semester, departmentId, cgpa, activeBacklogs } = req.body || {};
  db.transaction(() => {
    if (status === 'active' || status === 'inactive') {
      db.prepare(`UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, stu.user_id);
    }
    db.prepare(
      `UPDATE students SET semester = ?, department_id = ?, cgpa = ?, active_backlogs = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      semester ?? stu.semester,
      departmentId ?? stu.department_id,
      cgpa ?? stu.cgpa,
      activeBacklogs ?? stu.active_backlogs,
      studentId
    );
  })();

  recordAuditLog(
    req.authUser!.id,
    req.authUser!.email,
    'STUDENT_UPDATED',
    'student',
    studentId,
    `Updated status/academic details`,
    req.ip
  );
  res.json({ message: 'Student record updated.' });
});

// TEACHERS CRUD
adminRouter.get('/teachers', (_req, res) => {
  const teachers = db
    .prepare(
      `
      SELECT t.id as teacher_id, u.id as user_id, u.full_name, u.email, u.college_id, u.status,
             d.id as department_id, d.code as department_code, d.name as department_name,
             t.designation, t.can_publish_results
      FROM teachers t
      JOIN users u ON u.id = t.user_id
      JOIN departments d ON d.id = t.department_id
      ORDER BY u.college_id
    `
    )
    .all() as any[];

  const assignments = db
    .prepare(
      `SELECT ts.teacher_id, sub.id as subject_id, sub.code, sub.name FROM teacher_subjects ts JOIN subjects sub ON sub.id = ts.subject_id`
    )
    .all() as any[];

  res.json({
    teachers: teachers.map((t) => ({
      ...t,
      assignedSubjects: assignments.filter((a) => a.teacher_id === t.teacher_id),
    })),
  });
});

adminRouter.post('/teachers', (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    collegeId: z.string().min(3),
    departmentId: z.coerce.number().int().positive(),
    designation: z.string().min(2).default('Assistant Professor'),
    canPublishResults: z.boolean().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid teacher details.' });

  const email = parsed.data.email.trim().toLowerCase();
  const collegeId = parsed.data.collegeId.trim().toUpperCase();
  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ? OR upper(college_id) = ?').get(email, collegeId);
  if (exists) return res.status(409).json({ error: 'Email or Faculty ID already exists.' });

  const roleId = (db.prepare("SELECT id FROM roles WHERE name = 'teacher'").get() as any).id;
  const hash = bcrypt.hashSync('Campus@2026', 10);

  const teacherId = db.transaction(() => {
    const uRes = db
      .prepare(
        `INSERT INTO users (role_id, full_name, email, college_id, password_hash, status, email_verified) VALUES (?, ?, ?, ?, ?, 'active', 1)`
      )
      .run(roleId, parsed.data.fullName.trim(), email, collegeId, hash);
    const tRes = db
      .prepare(`INSERT INTO teachers (user_id, department_id, designation, can_publish_results) VALUES (?, ?, ?, ?)`)
      .run(
        Number(uRes.lastInsertRowid),
        parsed.data.departmentId,
        parsed.data.designation,
        parsed.data.canPublishResults ? 1 : 0
      );
    return Number(tRes.lastInsertRowid);
  })();

  recordAuditLog(req.authUser!.id, req.authUser!.email, 'TEACHER_CREATED', 'teacher', teacherId, `${collegeId} (${email})`, req.ip);
  res.status(201).json({ teacherId, message: 'Teacher created.' });
});

adminRouter.post('/teachers/:teacherId/assign-subject', (req, res) => {
  const teacherId = Number(req.params.teacherId);
  const subjectId = Number(req.body?.subjectId);
  if (!subjectId) return res.status(400).json({ error: 'subjectId required.' });

  db.prepare(`INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)`).run(teacherId, subjectId);
  recordAuditLog(
    req.authUser!.id,
    req.authUser!.email,
    'TEACHER_SUBJECT_ASSIGNED',
    'teacher',
    teacherId,
    `Assigned subject ${subjectId}`,
    req.ip
  );
  res.json({ message: 'Subject assigned to teacher.' });
});

// ROSTER APPROVALS
adminRouter.get('/roster', (_req, res) => {
  const roster = db
    .prepare(
      `SELECT r.*, d.code as department_code FROM roster_approvals r LEFT JOIN departments d ON d.id = r.department_id ORDER BY r.created_at DESC`
    )
    .all();
  res.json({ roster });
});

adminRouter.post('/roster', (req, res) => {
  const schema = z.object({
    collegeId: z.string().min(3),
    email: z.string().email(),
    roleName: z.enum(['student', 'teacher', 'admin']),
    departmentId: z.coerce.number().int().positive().nullable().optional(),
    semester: z.coerce.number().int().min(1).max(8).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid roster entry.' });

  try {
    db.prepare(
      `INSERT INTO roster_approvals (college_id, email, role_name, department_id, semester, invited_by) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      parsed.data.collegeId.trim().toUpperCase(),
      parsed.data.email.trim().toLowerCase(),
      parsed.data.roleName,
      parsed.data.departmentId ?? null,
      parsed.data.semester ?? null,
      req.authUser!.id
    );
    res.status(201).json({ message: 'Added to authorized college roster.' });
  } catch {
    res.status(409).json({ error: 'Email or College ID already on roster.' });
  }
});

// ACADEMICS (Departments, Subjects, Exams)
adminRouter.get('/academics', (_req, res) => {
  const departments = db.prepare('SELECT * FROM departments ORDER BY code').all();
  const subjects = db
    .prepare(
      `SELECT s.*, d.code as department_code FROM subjects s JOIN departments d ON d.id = s.department_id ORDER BY d.code, s.semester, s.code`
    )
    .all();
  const exams = db.prepare('SELECT * FROM exams ORDER BY exam_date ASC').all();
  res.json({ departments, subjects, exams });
});

adminRouter.post('/departments', (req, res) => {
  const { code, name, headName } = req.body || {};
  if (!code || !name) return res.status(400).json({ error: 'Department code and name are required.' });
  try {
    db.prepare('INSERT INTO departments (code, name, head_name) VALUES (?, ?, ?)').run(
      String(code).trim().toUpperCase(),
      String(name).trim(),
      headName ? String(headName).trim() : null
    );
    res.status(201).json({ message: 'Department created.' });
  } catch {
    res.status(409).json({ error: 'Department code already exists.' });
  }
});

adminRouter.post('/subjects', (req, res) => {
  const schema = z.object({
    code: z.string().min(2),
    name: z.string().min(2),
    departmentId: z.coerce.number().int().positive(),
    semester: z.coerce.number().int().min(1).max(8),
    credits: z.coerce.number().int().min(1).max(6).default(4),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid subject payload.' });
  try {
    db.prepare('INSERT INTO subjects (code, name, department_id, semester, credits) VALUES (?, ?, ?, ?, ?)').run(
      parsed.data.code.trim().toUpperCase(),
      parsed.data.name.trim(),
      parsed.data.departmentId,
      parsed.data.semester,
      parsed.data.credits
    );
    res.status(201).json({ message: 'Subject created.' });
  } catch {
    res.status(409).json({ error: 'Subject code already exists.' });
  }
});

// TIMETABLE BUILDER WITH CONFLICT CHECK
adminRouter.get('/timetable', (_req, res) => {
  const slots = db
    .prepare(
      `
      SELECT t.*, d.code as department_code, sub.code as subject_code, sub.name as subject_name, u.full_name as teacher_name
      FROM timetable t
      JOIN departments d ON d.id = t.department_id
      LEFT JOIN subjects sub ON sub.id = t.subject_id
      LEFT JOIN teachers tea ON tea.id = t.teacher_id
      LEFT JOIN users u ON u.id = tea.user_id
      ORDER BY d.code, t.semester, CASE t.day_of_week
        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, t.start_time
    `
    )
    .all();
  res.json({ slots });
});

adminRouter.post('/timetable', (req, res) => {
  const schema = z.object({
    departmentId: z.coerce.number().int().positive(),
    semester: z.coerce.number().int().min(1).max(8),
    dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    subjectId: z.coerce.number().int().positive(),
    teacherId: z.coerce.number().int().positive(),
    room: z.string().min(2).max(40),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid timetable slot input.' });

  const existing = db
    .prepare(
      `SELECT id, day_of_week as dayOfWeek, start_time as startTime, end_time as endTime, room, teacher_id as teacherId, department_id as departmentId, semester FROM timetable`
    )
    .all() as any[];

  const conflict = checkTimetableConflict(existing, parsed.data);
  if (conflict) {
    return res.status(409).json({ error: conflict });
  }

  db.prepare(
    `INSERT INTO timetable (department_id, semester, day_of_week, start_time, end_time, subject_id, teacher_id, room, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    parsed.data.departmentId,
    parsed.data.semester,
    parsed.data.dayOfWeek,
    parsed.data.startTime,
    parsed.data.endTime,
    parsed.data.subjectId,
    parsed.data.teacherId,
    parsed.data.room.trim()
  );

  recordAuditLog(
    req.authUser!.id,
    req.authUser!.email,
    'TIMETABLE_CREATED',
    'timetable',
    null,
    `${parsed.data.dayOfWeek} ${parsed.data.startTime}-${parsed.data.endTime} in ${parsed.data.room}`,
    req.ip
  );
  res.status(201).json({ message: 'Timetable entry scheduled with zero conflicts.' });
});

adminRouter.delete('/timetable/:id', (req, res) => {
  db.prepare('DELETE FROM timetable WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// FEES MANAGEMENT
adminRouter.get('/fees', (_req, res) => {
  const feeTypes = db.prepare('SELECT * FROM fee_types ORDER BY name').all();
  const invoices = db
    .prepare(
      `
      SELECT fi.*, ft.name as fee_category, u.full_name as student_name, u.college_id,
             COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.invoice_id = fi.id), 0) as amount_paid
      FROM fee_invoices fi
      JOIN fee_types ft ON ft.id = fi.fee_type_id
      JOIN students st ON st.id = fi.student_id
      JOIN users u ON u.id = st.user_id
      ORDER BY fi.due_date DESC
    `
    )
    .all();
  res.json({ feeTypes, invoices });
});

adminRouter.post('/fees/invoices', (req, res) => {
  const schema = z.object({
    studentId: z.coerce.number().int().positive(),
    feeTypeId: z.coerce.number().int().positive(),
    amountDue: z.coerce.number().positive(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid invoice data.' });

  const invNo = `INV-2026-${Math.floor(2000 + Math.random() * 7999)}`;
  db.prepare(
    `INSERT INTO fee_invoices (student_id, fee_type_id, invoice_number, amount_due, due_date, status) VALUES (?, ?, ?, ?, ?, 'unpaid')`
  ).run(parsed.data.studentId, parsed.data.feeTypeId, invNo, parsed.data.amountDue, parsed.data.dueDate);

  recordAuditLog(
    req.authUser!.id,
    req.authUser!.email,
    'FEE_INVOICE_CREATED',
    'fee_invoice',
    invNo,
    `INR ${parsed.data.amountDue} for student #${parsed.data.studentId}`,
    req.ip
  );
  res.status(201).json({ invoiceNumber: invNo, message: 'Invoice generated.' });
});

adminRouter.post('/fees/invoices/:id/record-payment', (req, res) => {
  const invoiceId = Number(req.params.id);
  const schema = z.object({
    amountPaid: z.coerce.number().positive(),
    paymentMode: z.string().min(2),
    referenceNumber: z.string().min(3),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payment details.' });

  const inv = db.prepare('SELECT * FROM fee_invoices WHERE id = ?').get(invoiceId) as any;
  if (!inv) return res.status(404).json({ error: 'Invoice not found.' });

  db.transaction(() => {
    db.prepare(
      `INSERT INTO fee_payments (invoice_id, amount_paid, payment_date, payment_mode, reference_number, recorded_by) VALUES (?, ?, date('now'), ?, ?, ?)`
    ).run(invoiceId, parsed.data.amountPaid, parsed.data.paymentMode, parsed.data.referenceNumber, req.authUser!.id);

    const paidSum = (
      db.prepare('SELECT COALESCE(SUM(amount_paid), 0) as s FROM fee_payments WHERE invoice_id = ?').get(invoiceId) as any
    ).s;
    const newStatus = paidSum >= inv.amount_due ? 'paid' : 'partial';
    db.prepare(`UPDATE fee_invoices SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, invoiceId);
  })();

  recordAuditLog(
    req.authUser!.id,
    req.authUser!.email,
    'FEE_PAYMENT_RECORDED',
    'fee_invoice',
    inv.invoice_number,
    `Recorded INR ${parsed.data.amountPaid} (${parsed.data.referenceNumber})`,
    req.ip
  );
  res.json({ message: 'Payment recorded in ledger.' });
});

// ANNOUNCEMENTS
adminRouter.get('/announcements', (_req, res) => {
  const announcements = db
    .prepare(
      `SELECT a.*, d.code as department_code FROM announcements a LEFT JOIN departments d ON d.id = a.department_id ORDER BY a.created_at DESC`
    )
    .all();
  res.json({ announcements });
});

adminRouter.post('/announcements', (req, res) => {
  const schema = z.object({
    title: z.string().min(3).max(160),
    body: z.string().min(5).max(3000),
    category: z.enum(['college', 'department', 'examination', 'placement']),
    departmentId: z.coerce.number().int().positive().nullable().optional(),
    targetRole: z.enum(['all', 'student', 'teacher', 'admin']).default('all'),
    expiryDate: z.string().nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid announcement data.' });

  const r = db
    .prepare(
      `INSERT INTO announcements (title, body, category, department_id, target_role, published_by, publish_date, expiry_date, status)
       VALUES (?, ?, ?, ?, ?, ?, date('now'), ?, 'published')`
    )
    .run(
      parsed.data.title.trim(),
      parsed.data.body.trim(),
      parsed.data.category,
      parsed.data.departmentId ?? null,
      parsed.data.targetRole,
      req.authUser!.id,
      parsed.data.expiryDate || null
    );

  recordAuditLog(req.authUser!.id, req.authUser!.email, 'ANNOUNCEMENT_PUBLISHED', 'announcement', Number(r.lastInsertRowid), parsed.data.title, req.ip);
  res.status(201).json({ message: 'Announcement published.' });
});

adminRouter.patch('/announcements/:id', (req, res) => {
  const status = req.body?.status;
  if (!['published', 'archived', 'draft'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }
  db.prepare('UPDATE announcements SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.json({ message: 'Announcement updated.' });
});

// PLACEMENTS
adminRouter.get('/placements', (_req, res) => {
  const companies = db.prepare('SELECT * FROM companies ORDER BY name').all();
  const drives = db
    .prepare(
      `
      SELECT pd.*, c.name as company_name, c.industry,
             (SELECT COUNT(*) FROM placement_applications pa WHERE pa.drive_id = pd.id) as applicant_count
      FROM placement_drives pd
      JOIN companies c ON c.id = pd.company_id
      ORDER BY pd.drive_date DESC
    `
    )
    .all();
  const applications = db
    .prepare(
      `
      SELECT pa.*, u.full_name as student_name, u.college_id, st.cgpa, c.name as company_name, pd.role_title
      FROM placement_applications pa
      JOIN students st ON st.id = pa.student_id
      JOIN users u ON u.id = st.user_id
      JOIN placement_drives pd ON pd.id = pa.drive_id
      JOIN companies c ON c.id = pd.company_id
      ORDER BY pa.applied_at DESC
    `
    )
    .all();
  res.json({ companies, drives, applications });
});

adminRouter.post('/placements/companies', (req, res) => {
  const { name, industry, location, description } = req.body || {};
  if (!name || !industry || !location) return res.status(400).json({ error: 'Name, industry, and location are required.' });
  try {
    db.prepare('INSERT INTO companies (name, industry, location, description) VALUES (?, ?, ?, ?)').run(
      String(name).trim(),
      String(industry).trim(),
      String(location).trim(),
      description ? String(description).trim() : null
    );
    res.status(201).json({ message: 'Company added.' });
  } catch {
    res.status(409).json({ error: 'Company already exists.' });
  }
});

adminRouter.post('/placements/drives', (req, res) => {
  const schema = z.object({
    companyId: z.coerce.number().int().positive(),
    roleTitle: z.string().min(2),
    packageLpa: z.string().min(2),
    minCgpa: z.coerce.number().min(0).max(10),
    maxBacklogs: z.coerce.number().int().min(0).max(10),
    allowedDepartments: z.string().min(2),
    driveDate: z.string(),
    applicationDeadline: z.string(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid drive specification.' });

  db.prepare(
    `INSERT INTO placement_drives (company_id, role_title, package_lpa, min_cgpa, max_backlogs, allowed_departments, drive_date, application_deadline, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`
  ).run(
    parsed.data.companyId,
    parsed.data.roleTitle.trim(),
    parsed.data.packageLpa.trim(),
    parsed.data.minCgpa,
    parsed.data.maxBacklogs,
    parsed.data.allowedDepartments.trim().toUpperCase(),
    parsed.data.driveDate,
    parsed.data.applicationDeadline
  );
  res.status(201).json({ message: 'Placement drive created.' });
});

// DOCUMENT INTELLIGENCE / RAG MANAGEMENT
adminRouter.get('/documents', (_req, res) => {
  const documents = db
    .prepare(
      `
      SELECT d.*, dept.code as department_code, u.full_name as uploader_name,
             (SELECT COUNT(*) FROM document_chunks dc WHERE dc.document_id = d.id) as chunk_count
      FROM documents d
      LEFT JOIN departments dept ON dept.id = d.department_id
      LEFT JOIN users u ON u.id = d.uploaded_by
      ORDER BY d.created_at DESC
    `
    )
    .all();
  res.json({ documents });
});

adminRouter.post('/documents/upload', uploadPdf.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Please select a valid PDF file to upload.' });
  }

  const title = String(req.body?.title || file.originalname.replace(/\.pdf$/i, '')).trim();
  const category = ['regulations', 'circular', 'calendar', 'handbook', 'placement_policy', 'department_guide'].includes(
    req.body?.category
  )
    ? req.body.category
    : 'circular';
  const departmentId = req.body?.departmentId ? Number(req.body.departmentId) : null;
  const academicYear = String(req.body?.academicYear || '2026-27').trim();
  const accessRole = ['all', 'student', 'teacher', 'admin'].includes(req.body?.accessRole)
    ? req.body.accessRole
    : 'all';

  // Validate PDF magic header %PDF
  const buffer = fs.readFileSync(file.path);
  if (buffer.subarray(0, 4).toString('utf-8') !== '%PDF') {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Invalid PDF file signature. Upload rejected for security.' });
  }

  const docInsert = db
    .prepare(
      `
      INSERT INTO documents (title, category, department_id, academic_year, access_role, file_name, storage_path, file_size_bytes, processing_status, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?)
    `
    )
    .run(
      title,
      category,
      departmentId,
      academicYear,
      accessRole,
      file.originalname,
      file.filename,
      file.size,
      req.authUser!.id
    );
  const documentId = Number(docInsert.lastInsertRowid);

  try {
    const { pages, pageCount } = await extractPdfPages(buffer);
    if (pages.length === 0) {
      db.prepare(
        `UPDATE documents SET processing_status = 'error', error_message = 'PDF contains no extractable text (likely scanned image without OCR).', updated_at = datetime('now') WHERE id = ?`
      ).run(documentId);
      return res.status(422).json({
        error: 'The uploaded PDF contains no extractable text (scanned images require OCR before indexing).',
        documentId,
      });
    }

    const chunkCount = await indexDocumentChunks(documentId, pages);
    db.prepare(
      `UPDATE documents SET processing_status = 'ready', page_count = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(pageCount, documentId);

    recordAuditLog(
      req.authUser!.id,
      req.authUser!.email,
      'DOCUMENT_INDEXED',
      'document',
      documentId,
      `${title} (${pageCount} pages, ${chunkCount} chunks)`,
      req.ip
    );

    res.status(201).json({
      documentId,
      pageCount,
      chunkCount,
      message: `Document indexed successfully (${pageCount} pages, ${chunkCount} searchable chunks).`,
    });
  } catch (err: any) {
    db.prepare(
      `UPDATE documents SET processing_status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(err?.message || 'PDF parsing error', documentId);
    res.status(422).json({ error: `Failed to parse PDF: ${err?.message || 'Unknown error'}` });
  }
});

adminRouter.patch('/documents/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.archived ? 'archived' : 'ready';
  db.prepare(`UPDATE documents SET processing_status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  res.json({ message: `Document marked as ${status}.` });
});

adminRouter.delete('/documents/:id', (req, res) => {
  const id = Number(req.params.id);
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
  if (!doc) return res.status(404).json({ error: 'Document not found.' });
  if (doc.storage_path) {
    const p = path.join(DOCS_DIR, doc.storage_path);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  recordAuditLog(req.authUser!.id, req.authUser!.email, 'DOCUMENT_DELETED', 'document', id, doc.title, req.ip);
  res.json({ message: 'Document removed.' });
});

// REPORTS & AUDIT LOGS
adminRouter.get('/reports', (_req, res) => {
  const reqPct = getRequiredAttendancePct();
  const attendanceReport = db
    .prepare(
      `
      SELECT u.college_id, u.full_name, d.code as department_code, st.semester,
             SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as attended,
             COUNT(a.id) as conducted
      FROM students st
      JOIN users u ON u.id = st.user_id
      JOIN departments d ON d.id = st.department_id
      LEFT JOIN attendance a ON a.student_id = st.id
      GROUP BY st.id
      ORDER BY u.college_id
    `
    )
    .all()
    .map((r: any) => ({
      ...r,
      percentage: r.conducted > 0 ? Number(((r.attended / r.conducted) * 100).toFixed(2)) : 100,
      belowThreshold: r.conducted > 0 && (r.attended / r.conducted) * 100 < reqPct,
    }));

  res.json({ requiredAttendancePct: reqPct, attendanceReport });
});

adminRouter.get('/audit-logs', (_req, res) => {
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
  res.json({ logs });
});
