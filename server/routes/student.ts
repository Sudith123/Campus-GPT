import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/schema';
import { getRequiredAttendancePct, recordAuditLog, requireAuth, requireRole } from '../middleware/auth';
import {
  calculateAcademicPerformance,
  calculateAttendanceMetrics,
  evaluatePlacementEligibility,
} from '../../src/lib/academicMath';

export const studentRouter = Router();
studentRouter.use(requireAuth, requireRole(['student']));

const SUBMISSION_DIR = path.resolve(process.cwd(), 'uploads', 'submissions');
if (!fs.existsSync(SUBMISSION_DIR)) {
  fs.mkdirSync(SUBMISSION_DIR, { recursive: true });
}

const uploadSubmission = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SUBMISSION_DIR),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md', '.zip', '.py', '.c', '.cpp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Unsupported file type. Allowed: PDF, TXT, MD, ZIP, code files.'));
    }
    cb(null, true);
  },
});

function buildStudentAttendance(studentId: number, thresholdOverride?: number) {
  const reqPct = thresholdOverride ?? getRequiredAttendancePct();
  const rows = db
    .prepare(
      `
      SELECT sub.id as subject_id, sub.code, sub.name, sub.credits,
             SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as attended,
             COUNT(a.id) as conducted
      FROM enrollments e
      JOIN subjects sub ON sub.id = e.subject_id
      LEFT JOIN attendance a ON a.student_id = e.student_id AND a.subject_id = e.subject_id
      WHERE e.student_id = ?
      GROUP BY sub.id
      ORDER BY sub.code
    `
    )
    .all(studentId) as any[];

  let totalAttended = 0;
  let totalConducted = 0;

  const subjects = rows.map((r) => {
    const att = r.attended || 0;
    const cond = r.conducted || 0;
    totalAttended += att;
    totalConducted += cond;
    return {
      subjectId: r.subject_id,
      subjectCode: r.code,
      subjectName: r.name,
      credits: r.credits,
      ...calculateAttendanceMetrics(att, cond, reqPct),
    };
  });

  const overall = calculateAttendanceMetrics(totalAttended, totalConducted, reqPct);

  const history = db
    .prepare(
      `
      SELECT a.session_date, a.session_slot, a.status, sub.code as subject_code, sub.name as subject_name
      FROM attendance a
      JOIN subjects sub ON sub.id = a.subject_id
      WHERE a.student_id = ?
      ORDER BY a.session_date DESC, a.id DESC
      LIMIT 40
    `
    )
    .all(studentId);

  const trend = db
    .prepare(
      `
      SELECT substr(a.session_date, 1, 7) as month,
             ROUND(AVG(CASE WHEN a.status = 'present' THEN 100.0 ELSE 0.0 END), 1) as percentage,
             COUNT(*) as sessions
      FROM attendance a
      WHERE a.student_id = ?
      GROUP BY substr(a.session_date, 1, 7)
      ORDER BY month ASC
    `
    )
    .all(studentId);

  return { requiredPercentage: reqPct, overall, subjects, history, trend };
}

studentRouter.get('/dashboard', (req, res) => {
  const user = req.authUser!;
  const studentId = user.studentId!;

  const attendance = buildStudentAttendance(studentId);

  const marksRows = db
    .prepare(
      `
      SELECT sub.code as subjectCode, sub.name as subjectName, ex.name as examName,
             ex.exam_type as examType, ex.exam_date as examDate,
             m.marks_obtained as marksObtained, ex.max_marks as maxMarks
      FROM marks m
      JOIN subjects sub ON sub.id = m.subject_id
      JOIN exams ex ON ex.id = m.exam_id
      WHERE m.student_id = ? AND m.published = 1
      ORDER BY ex.exam_date ASC, sub.code ASC
    `
    )
    .all(studentId) as any[];
  const performance = calculateAcademicPerformance(marksRows);

  const timetable = db
    .prepare(
      `
      SELECT t.*, sub.code as subject_code, sub.name as subject_name, u.full_name as teacher_name
      FROM timetable t
      LEFT JOIN subjects sub ON sub.id = t.subject_id
      LEFT JOIN teachers tea ON tea.id = t.teacher_id
      LEFT JOIN users u ON u.id = tea.user_id
      WHERE t.department_id = ? AND t.semester = ? AND t.published = 1
      ORDER BY CASE t.day_of_week
        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, t.start_time
    `
    )
    .all(user.departmentId, user.semester);

  const assignments = db
    .prepare(
      `
      SELECT a.*, sub.code as subject_code, sub.name as subject_name, u.full_name as teacher_name,
             s.id as submission_id, s.submission_text, s.file_name, s.status as submission_status,
             s.score, s.feedback, s.submitted_at
      FROM enrollments e
      JOIN assignments a ON a.subject_id = e.subject_id
      JOIN subjects sub ON sub.id = a.subject_id
      JOIN teachers tea ON tea.id = a.teacher_id
      JOIN users u ON u.id = tea.user_id
      LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = e.student_id
      WHERE e.student_id = ?
      ORDER BY a.due_date ASC
    `
    )
    .all(studentId);

  const invoices = db
    .prepare(
      `
      SELECT fi.*, ft.name as fee_category, ft.description as fee_description,
             COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments fp WHERE fp.invoice_id = fi.id), 0) as amount_paid
      FROM fee_invoices fi
      JOIN fee_types ft ON ft.id = fi.fee_type_id
      WHERE fi.student_id = ?
      ORDER BY fi.due_date ASC
    `
    )
    .all(studentId) as any[];

  const payments = db
    .prepare(
      `
      SELECT fp.*, fi.invoice_number, ft.name as fee_category
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN fee_types ft ON ft.id = fi.fee_type_id
      WHERE fi.student_id = ?
      ORDER BY fp.payment_date DESC
    `
    )
    .all(studentId);

  const totalPayable = invoices.reduce((sum, i) => sum + i.amount_due, 0);
  const totalPaid = invoices.reduce((sum, i) => sum + i.amount_paid, 0);

  const drivesRaw = db
    .prepare(
      `
      SELECT pd.*, c.name as company_name, c.industry, c.location, c.description as company_description,
             pa.status as application_status, pa.applied_at
      FROM placement_drives pd
      JOIN companies c ON c.id = pd.company_id
      LEFT JOIN placement_applications pa ON pa.drive_id = pd.id AND pa.student_id = ?
      WHERE pd.status = 'open'
      ORDER BY pd.drive_date ASC
    `
    )
    .all(studentId) as any[];

  const placements = drivesRaw.map((d) => {
    const elig = evaluatePlacementEligibility(
      {
        cgpa: user.cgpa || 0,
        activeBacklogs: user.activeBacklogs || 0,
        departmentCode: user.departmentCode || 'CSE',
        semester: user.semester || 1,
      },
      {
        minCgpa: d.min_cgpa,
        maxBacklogs: d.max_backlogs,
        allowedDepartments: String(d.allowed_departments || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        minSemester: d.min_semester,
      }
    );
    return { ...d, eligible: elig.eligible, ineligibilityReasons: elig.reasons };
  });

  const announcements = db
    .prepare(
      `
      SELECT a.*, d.code as department_code, u.full_name as author_name
      FROM announcements a
      LEFT JOIN departments d ON d.id = a.department_id
      LEFT JOIN users u ON u.id = a.published_by
      WHERE a.status = 'published'
        AND (a.target_role = 'all' OR a.target_role = 'student')
        AND (a.department_id IS NULL OR a.department_id = ?)
      ORDER BY a.publish_date DESC
    `
    )
    .all(user.departmentId);

  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(user.id);

  res.json({
    attendance,
    marks: { records: marksRows, summary: performance },
    timetable,
    assignments,
    fees: {
      paymentGatewayConfigured: false,
      readOnlyNotice: 'Read-only fee ledger. Online payment gateway is not configured in this deployment.',
      totalPayable,
      totalPaid,
      outstandingBalance: Math.max(0, totalPayable - totalPaid),
      invoices,
      payments,
    },
    placements,
    announcements,
    notifications,
  });
});

studentRouter.post('/attendance/predict', (req, res) => {
  const studentId = req.authUser!.studentId!;
  const schema = z.object({
    requiredPercentage: z.coerce.number().min(1).max(99).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Target percentage must be between 1 and 99.' });
  }
  const data = buildStudentAttendance(studentId, parsed.data.requiredPercentage);
  res.json(data);
});

studentRouter.get('/marks/export', (req, res) => {
  const user = req.authUser!;
  const rows = db
    .prepare(
      `
      SELECT sub.code, sub.name, ex.name as exam_name, m.marks_obtained, ex.max_marks,
             ROUND((m.marks_obtained / ex.max_marks) * 100, 2) as percentage
      FROM marks m
      JOIN subjects sub ON sub.id = m.subject_id
      JOIN exams ex ON ex.id = m.exam_id
      WHERE m.student_id = ? AND m.published = 1
      ORDER BY sub.code, ex.exam_date
    `
    )
    .all(user.studentId!) as any[];

  const header = 'Student ID,Student Name,Subject Code,Subject Name,Examination,Marks Obtained,Max Marks,Percentage\n';
  const csvRows = rows
    .map(
      (r) =>
        `"${user.collegeId}","${user.fullName}","${r.code}","${r.name}","${r.exam_name}",${r.marks_obtained},${r.max_marks},${r.percentage}%`
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="CampusGPT_Academic_Report_${user.collegeId}.csv"`);
  res.send(header + csvRows);
});

studentRouter.post('/assignments/:id/submit', uploadSubmission.single('file'), (req, res) => {
  const user = req.authUser!;
  const assignmentId = Number(req.params.id);
  const submissionText = String(req.body?.submissionText || '').trim();
  const file = req.file;

  if (!submissionText && !file) {
    return res.status(400).json({ error: 'Please provide submission notes or attach a file.' });
  }

  // Verify student is enrolled in the assignment's subject
  const enrolled = db
    .prepare(
      `
      SELECT a.id FROM assignments a
      JOIN enrollments e ON e.subject_id = a.subject_id
      WHERE a.id = ? AND e.student_id = ?
    `
    )
    .get(assignmentId, user.studentId!);

  if (!enrolled) {
    return res.status(403).json({ error: 'You are not enrolled in this assignment subject.' });
  }

  db.prepare(
    `
    INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_name, file_path, status, submitted_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'submitted', datetime('now'), datetime('now'))
    ON CONFLICT(assignment_id, student_id) DO UPDATE SET
      submission_text = excluded.submission_text,
      file_name = COALESCE(excluded.file_name, assignment_submissions.file_name),
      file_path = COALESCE(excluded.file_path, assignment_submissions.file_path),
      status = 'submitted',
      updated_at = datetime('now')
  `
  ).run(assignmentId, user.studentId!, submissionText || null, file?.originalname || null, file?.filename || null);

  recordAuditLog(user.id, user.email, 'ASSIGNMENT_SUBMITTED', 'assignment', assignmentId, `Submitted work`, req.ip);
  res.json({ message: 'Assignment submitted successfully.' });
});

studentRouter.post('/placements/:driveId/apply', (req, res) => {
  const user = req.authUser!;
  const driveId = Number(req.params.driveId);

  const drive = db.prepare(`SELECT * FROM placement_drives WHERE id = ? AND status = 'open'`).get(driveId) as any;
  if (!drive) {
    return res.status(404).json({ error: 'Placement drive not found or closed.' });
  }

  const elig = evaluatePlacementEligibility(
    {
      cgpa: user.cgpa || 0,
      activeBacklogs: user.activeBacklogs || 0,
      departmentCode: user.departmentCode || 'CSE',
      semester: user.semester || 1,
    },
    {
      minCgpa: drive.min_cgpa,
      maxBacklogs: drive.max_backlogs,
      allowedDepartments: String(drive.allowed_departments || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      minSemester: drive.min_semester,
    }
  );

  if (!elig.eligible) {
    return res.status(403).json({ error: `Not eligible: ${elig.reasons.join('; ')}` });
  }

  db.prepare(
    `INSERT OR IGNORE INTO placement_applications (drive_id, student_id, status) VALUES (?, ?, 'applied')`
  ).run(driveId, user.studentId!);

  recordAuditLog(user.id, user.email, 'PLACEMENT_APPLIED', 'placement_drive', driveId, 'Applied to drive', req.ip);
  res.json({ message: 'Placement application submitted.' });
});

studentRouter.post('/notifications/:id/read', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, req.authUser!.id);
  res.json({ ok: true });
});
