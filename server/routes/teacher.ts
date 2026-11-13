import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/schema';
import { getRequiredAttendancePct, recordAuditLog, requireAuth, requireRole } from '../middleware/auth';
import { calculateAttendanceMetrics } from '../../src/lib/academicMath';

export const teacherRouter = Router();
teacherRouter.use(requireAuth, requireRole(['teacher']));

function verifyTeacherSubject(teacherId: number, subjectId: number): boolean {
  const row = db
    .prepare('SELECT id FROM teacher_subjects WHERE teacher_id = ? AND subject_id = ?')
    .get(teacherId, subjectId);
  return Boolean(row);
}

teacherRouter.get('/overview', (req, res) => {
  const user = req.authUser!;
  const teacherId = user.teacherId!;

  const subjects = db
    .prepare(
      `
      SELECT sub.id, sub.code, sub.name, sub.semester, sub.credits, d.code as department_code, ts.section,
             (SELECT COUNT(*) FROM enrollments e WHERE e.subject_id = sub.id) as student_count
      FROM teacher_subjects ts
      JOIN subjects sub ON sub.id = ts.subject_id
      JOIN departments d ON d.id = sub.department_id
      WHERE ts.teacher_id = ?
      ORDER BY sub.code
    `
    )
    .all(teacherId);

  const pendingGrading = db
    .prepare(
      `
      SELECT COUNT(*) as c
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE a.teacher_id = ? AND s.status = 'submitted'
    `
    )
    .get(teacherId) as { c: number };

  const timetable = db
    .prepare(
      `
      SELECT t.*, sub.code as subject_code, sub.name as subject_name, d.code as department_code
      FROM timetable t
      JOIN subjects sub ON sub.id = t.subject_id
      JOIN departments d ON d.id = t.department_id
      WHERE t.teacher_id = ? AND t.published = 1
      ORDER BY CASE t.day_of_week
        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 ELSE 6 END, t.start_time
    `
    )
    .all(teacherId);

  const exams = db.prepare('SELECT * FROM exams ORDER BY exam_date ASC').all();

  const announcements = db
    .prepare(
      `
      SELECT a.*, d.code as department_code
      FROM announcements a
      LEFT JOIN departments d ON d.id = a.department_id
      WHERE a.status = 'published' AND (a.target_role = 'all' OR a.target_role = 'teacher')
      ORDER BY a.publish_date DESC
    `
    )
    .all();

  res.json({
    subjects,
    pendingGradingCount: pendingGrading.c,
    timetable,
    exams,
    announcements,
    requiredAttendancePct: getRequiredAttendancePct(),
  });
});

teacherRouter.get('/students', (req, res) => {
  const teacherId = req.authUser!.teacherId!;
  const subjectId = req.query.subjectId ? Number(req.query.subjectId) : null;
  const search = String(req.query.q || '').trim().toLowerCase();
  const reqPct = getRequiredAttendancePct();

  const rows = db
    .prepare(
      `
      SELECT DISTINCT st.id as student_id, u.full_name, u.college_id, u.email, d.code as department_code,
             st.semester, st.section, st.cgpa, sub.id as subject_id, sub.code as subject_code, sub.name as subject_name,
             (SELECT SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END)
              FROM attendance a WHERE a.student_id = st.id AND a.subject_id = sub.id) as attended,
             (SELECT COUNT(*) FROM attendance a WHERE a.student_id = st.id AND a.subject_id = sub.id) as conducted
      FROM teacher_subjects ts
      JOIN subjects sub ON sub.id = ts.subject_id
      JOIN enrollments e ON e.subject_id = sub.id
      JOIN students st ON st.id = e.student_id
      JOIN users u ON u.id = st.user_id
      JOIN departments d ON d.id = st.department_id
      WHERE ts.teacher_id = ?
        AND (? IS NULL OR sub.id = ?)
      ORDER BY sub.code, u.college_id
    `
    )
    .all(teacherId, subjectId, subjectId) as any[];

  const filtered = rows
    .filter(
      (r) =>
        !search ||
        r.full_name.toLowerCase().includes(search) ||
        r.college_id.toLowerCase().includes(search)
    )
    .map((r) => ({
      ...r,
      attendance: calculateAttendanceMetrics(r.attended || 0, r.conducted || 0, reqPct),
    }));

  res.json({ students: filtered });
});

teacherRouter.post('/attendance/session', (req, res) => {
  const user = req.authUser!;
  const teacherId = user.teacherId!;

  const schema = z.object({
    subjectId: z.coerce.number().int().positive(),
    sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sessionSlot: z.string().min(2).max(30),
    entries: z
      .array(
        z.object({
          studentId: z.coerce.number().int().positive(),
          status: z.enum(['present', 'absent']),
        })
      )
      .min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid attendance session payload.' });
  }

  const { subjectId, sessionDate, sessionSlot, entries } = parsed.data;
  if (!verifyTeacherSubject(teacherId, subjectId)) {
    return res.status(403).json({ error: 'You are not authorized to record attendance for this subject.' });
  }

  const saveAttendance = db.transaction(() => {
    const upsert = db.prepare(`
      INSERT INTO attendance (student_id, subject_id, session_date, session_slot, status, marked_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id, subject_id, session_date, session_slot) DO UPDATE SET
        status = excluded.status,
        marked_by = excluded.marked_by,
        updated_at = datetime('now')
    `);
    for (const item of entries) {
      upsert.run(item.studentId, subjectId, sessionDate, sessionSlot, item.status, user.id);
    }
  });

  saveAttendance();
  recordAuditLog(
    user.id,
    user.email,
    'ATTENDANCE_RECORDED',
    'subject',
    subjectId,
    `${entries.length} student records saved for ${sessionDate} (${sessionSlot})`,
    req.ip
  );
  res.json({ message: `Saved attendance for ${entries.length} student(s).` });
});

teacherRouter.get('/marks', (req, res) => {
  const teacherId = req.authUser!.teacherId!;
  const subjectId = Number(req.query.subjectId);
  const examId = Number(req.query.examId);

  if (!subjectId || !examId) {
    return res.status(400).json({ error: 'subjectId and examId are required.' });
  }
  if (!verifyTeacherSubject(teacherId, subjectId)) {
    return res.status(403).json({ error: 'You are not authorized to view marks for this subject.' });
  }

  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as any;
  if (!exam) return res.status(404).json({ error: 'Examination not found.' });

  const students = db
    .prepare(
      `
      SELECT st.id as student_id, u.college_id, u.full_name, m.marks_obtained, m.published
      FROM enrollments e
      JOIN students st ON st.id = e.student_id
      JOIN users u ON u.id = st.user_id
      LEFT JOIN marks m ON m.student_id = st.id AND m.subject_id = e.subject_id AND m.exam_id = ?
      WHERE e.subject_id = ?
      ORDER BY u.college_id
    `
    )
    .all(examId, subjectId);

  res.json({ exam, students });
});

teacherRouter.post('/marks', (req, res) => {
  const user = req.authUser!;
  const teacherId = user.teacherId!;

  const schema = z.object({
    subjectId: z.coerce.number().int().positive(),
    examId: z.coerce.number().int().positive(),
    published: z.boolean().default(true),
    entries: z
      .array(
        z.object({
          studentId: z.coerce.number().int().positive(),
          marksObtained: z.coerce.number().min(0),
        })
      )
      .min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid marks payload.' });
  }

  const { subjectId, examId, published, entries } = parsed.data;
  if (!verifyTeacherSubject(teacherId, subjectId)) {
    return res.status(403).json({ error: 'Unauthorized subject.' });
  }

  if (published && !user.canPublishResults) {
    return res.status(403).json({ error: 'Your account does not have permission to publish results directly.' });
  }

  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId) as any;
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });

  for (const entry of entries) {
    if (entry.marksObtained > exam.max_marks) {
      return res.status(400).json({
        error: `Marks (${entry.marksObtained}) cannot exceed exam maximum (${exam.max_marks}).`,
      });
    }
  }

  const saveMarks = db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO marks (student_id, subject_id, exam_id, marks_obtained, published, entered_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id, subject_id, exam_id) DO UPDATE SET
        marks_obtained = excluded.marks_obtained,
        published = excluded.published,
        entered_by = excluded.entered_by,
        updated_at = datetime('now')
    `);
    for (const entry of entries) {
      stmt.run(entry.studentId, subjectId, examId, entry.marksObtained, published ? 1 : 0, user.id);
    }
  });

  saveMarks();
  recordAuditLog(
    user.id,
    user.email,
    'MARKS_UPDATED',
    'subject_exam',
    `${subjectId}:${examId}`,
    `Updated ${entries.length} mark record(s); published=${published}`,
    req.ip
  );
  res.json({ message: 'Marks saved and validated.' });
});

teacherRouter.get('/assignments', (req, res) => {
  const teacherId = req.authUser!.teacherId!;
  const assignments = db
    .prepare(
      `
      SELECT a.*, sub.code as subject_code, sub.name as subject_name,
             (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) as submission_count,
             (SELECT COUNT(*) FROM enrollments e WHERE e.subject_id = a.subject_id) as total_students
      FROM assignments a
      JOIN subjects sub ON sub.id = a.subject_id
      WHERE a.teacher_id = ?
      ORDER BY a.due_date DESC
    `
    )
    .all(teacherId);
  res.json({ assignments });
});

teacherRouter.post('/assignments', (req, res) => {
  const user = req.authUser!;
  const teacherId = user.teacherId!;

  const schema = z.object({
    subjectId: z.coerce.number().int().positive(),
    title: z.string().min(3).max(150),
    instructions: z.string().min(5).max(3000),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    maxScore: z.coerce.number().int().min(1).max(200),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid assignment data.' });
  }

  if (!verifyTeacherSubject(teacherId, parsed.data.subjectId)) {
    return res.status(403).json({ error: 'Not authorized for this subject.' });
  }

  const resInsert = db
    .prepare(
      `INSERT INTO assignments (subject_id, teacher_id, title, instructions, due_date, max_score) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.data.subjectId,
      teacherId,
      parsed.data.title.trim(),
      parsed.data.instructions.trim(),
      parsed.data.dueDate,
      parsed.data.maxScore
    );

  recordAuditLog(user.id, user.email, 'ASSIGNMENT_CREATED', 'assignment', Number(resInsert.lastInsertRowid), parsed.data.title, req.ip);
  res.status(201).json({ id: Number(resInsert.lastInsertRowid), message: 'Assignment published.' });
});

teacherRouter.get('/assignments/:id/submissions', (req, res) => {
  const teacherId = req.authUser!.teacherId!;
  const assignmentId = Number(req.params.id);

  const asg = db.prepare('SELECT * FROM assignments WHERE id = ? AND teacher_id = ?').get(assignmentId, teacherId) as any;
  if (!asg) return res.status(404).json({ error: 'Assignment not found or unauthorized.' });

  const submissions = db
    .prepare(
      `
      SELECT s.*, u.full_name as student_name, u.college_id
      FROM assignment_submissions s
      JOIN students st ON st.id = s.student_id
      JOIN users u ON u.id = st.user_id
      WHERE s.assignment_id = ?
      ORDER BY s.submitted_at DESC
    `
    )
    .all(assignmentId);

  res.json({ assignment: asg, submissions });
});

teacherRouter.post('/submissions/:subId/grade', (req, res) => {
  const user = req.authUser!;
  const teacherId = user.teacherId!;
  const subId = Number(req.params.subId);

  const schema = z.object({
    score: z.coerce.number().min(0),
    feedback: z.string().max(1000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid score or feedback.' });

  const sub = db
    .prepare(
      `
      SELECT s.id, a.max_score
      FROM assignment_submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.id = ? AND a.teacher_id = ?
    `
    )
    .get(subId, teacherId) as any;

  if (!sub) return res.status(404).json({ error: 'Submission not found or unauthorized.' });
  if (parsed.data.score > sub.max_score) {
    return res.status(400).json({ error: `Score cannot exceed assignment max score (${sub.max_score}).` });
  }

  db.prepare(
    `UPDATE assignment_submissions SET score = ?, feedback = ?, status = 'graded', updated_at = datetime('now') WHERE id = ?`
  ).run(parsed.data.score, parsed.data.feedback?.trim() || null, subId);

  res.json({ message: 'Submission graded.' });
});
