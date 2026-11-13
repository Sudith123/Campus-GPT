import bcrypt from 'bcryptjs';
import { db } from './schema';
import { chunkDocumentText } from '../../src/lib/academicMath';

export function seedDatabase() {
  const existingRoleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
  if (existingRoleCount > 0) {
    return;
  }

  const runSeed = db.transaction(() => {
    // 1. Institutional settings
    const insertSetting = db.prepare('INSERT INTO institutional_settings (key, value) VALUES (?, ?)');
    insertSetting.run('institution_name', 'Meridian Institute of Technology (Demo Institution)');
    insertSetting.run('required_attendance_pct', '75');
    insertSetting.run('condonation_min_pct', '65');
    insertSetting.run('payment_gateway_configured', 'false');
    insertSetting.run('academic_year', '2026-27');

    // 2. Roles
    const insertRole = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)');
    const rStudent = insertRole.run('student', 'Authenticated student with personal academic access').lastInsertRowid;
    const rTeacher = insertRole.run('teacher', 'Faculty member managing assigned subjects and classes').lastInsertRowid;
    const rAdmin = insertRole.run('admin', 'Authorized institutional administrator').lastInsertRowid;

    // 3. Departments
    const insertDept = db.prepare('INSERT INTO departments (code, name, head_name) VALUES (?, ?, ?)');
    const dCSE = insertDept.run('CSE', 'Computer Science & Engineering', 'Dr. R. Venkatesh').lastInsertRowid;
    const dECE = insertDept.run('ECE', 'Electronics & Communication Engineering', 'Dr. Meera Kulkarni').lastInsertRowid;
    const dME = insertDept.run('ME', 'Mechanical Engineering', 'Dr. Suresh Hegde').lastInsertRowid;

    // 4. Demo Users (password: DemoPass@2026)
    const demoHash = bcrypt.hashSync('DemoPass@2026', 10);
    const insertUser = db.prepare(`
      INSERT INTO users (role_id, full_name, email, college_id, password_hash, status, email_verified, preferred_language, phone, is_demo)
      VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?, 1)
    `);

    const uStudent1 = insertUser.run(
      rStudent,
      'Aarav Sharma',
      'aarav.sharma@meridian.edu.in',
      '1MIT24CS001',
      demoHash,
      'English',
      '+91 98450 11223'
    ).lastInsertRowid;

    const uStudent2 = insertUser.run(
      rStudent,
      'Diya Nair',
      'diya.nair@meridian.edu.in',
      '1MIT24CS002',
      demoHash,
      'English',
      '+91 98450 22334'
    ).lastInsertRowid;

    const uStudent3 = insertUser.run(
      rStudent,
      'Karthik Rao',
      'karthik.rao@meridian.edu.in',
      '1MIT24EC014',
      demoHash,
      'Kannada',
      '+91 98450 33445'
    ).lastInsertRowid;

    const uTeacher1 = insertUser.run(
      rTeacher,
      'Prof. Kavita Deshmukh',
      'prof.kavita@meridian.edu.in',
      'FAC-CSE-04',
      demoHash,
      'English',
      '+91 98450 44556'
    ).lastInsertRowid;

    const uTeacher2 = insertUser.run(
      rTeacher,
      'Dr. Arjun Menon',
      'arjun.menon@meridian.edu.in',
      'FAC-CSE-09',
      demoHash,
      'English',
      '+91 98450 55667'
    ).lastInsertRowid;

    const uAdmin = insertUser.run(
      rAdmin,
      'Dr. Nandini Iyer (Registrar)',
      'admin.registrar@meridian.edu.in',
      'ADM-REG-01',
      demoHash,
      'English',
      '+91 80 2345 6789'
    ).lastInsertRowid;

    // 5. Authorized College Roster for Registration Testing
    const insertRoster = db.prepare(`
      INSERT INTO roster_approvals (college_id, email, role_name, department_id, semester, invited_by, claimed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertRoster.run('1MIT24CS001', 'aarav.sharma@meridian.edu.in', 'student', dCSE, 5, uAdmin, 1);
    insertRoster.run('1MIT24CS002', 'diya.nair@meridian.edu.in', 'student', dCSE, 5, uAdmin, 1);
    insertRoster.run('1MIT24CS019', 'rohan.k@meridian.edu.in', 'student', dCSE, 5, uAdmin, 0);
    insertRoster.run('1MIT24EC025', 'ananya.b@meridian.edu.in', 'student', dECE, 5, uAdmin, 0);
    insertRoster.run('FAC-ECE-07', 'priya.n@meridian.edu.in', 'teacher', dECE, null, uAdmin, 0);

    // 6. Students & Teachers
    const insertStudent = db.prepare(`
      INSERT INTO students (user_id, department_id, semester, academic_year, section, cgpa, active_backlogs, guardian_contact)
      VALUES (?, ?, ?, '2026-27', 'A', ?, ?, ?)
    `);
    const s1 = insertStudent.run(uStudent1, dCSE, 5, 8.42, 0, '+91 98451 11220').lastInsertRowid;
    const s2 = insertStudent.run(uStudent2, dCSE, 5, 9.14, 0, '+91 98451 22330').lastInsertRowid;
    const s3 = insertStudent.run(uStudent3, dECE, 5, 6.85, 1, '+91 98451 33440').lastInsertRowid;

    const insertTeacher = db.prepare(`
      INSERT INTO teachers (user_id, department_id, designation, can_publish_results)
      VALUES (?, ?, ?, 1)
    `);
    const t1 = insertTeacher.run(uTeacher1, dCSE, 'Associate Professor').lastInsertRowid;
    const t2 = insertTeacher.run(uTeacher2, dCSE, 'Professor').lastInsertRowid;

    // 7. Subjects
    const insertSubject = db.prepare(`
      INSERT INTO subjects (code, name, department_id, semester, credits)
      VALUES (?, ?, ?, ?, ?)
    `);
    const subOS = insertSubject.run('CS501', 'Operating Systems', dCSE, 5, 4).lastInsertRowid;
    const subDBMS = insertSubject.run('CS502', 'Database Management Systems', dCSE, 5, 4).lastInsertRowid;
    const subCN = insertSubject.run('CS503', 'Computer Networks', dCSE, 5, 4).lastInsertRowid;
    const subSE = insertSubject.run('CS504', 'Software Engineering', dCSE, 5, 3).lastInsertRowid;
    const subAI = insertSubject.run('CS505', 'Applied Machine Learning', dCSE, 5, 4).lastInsertRowid;
    const subDSP = insertSubject.run('EC501', 'Digital Signal Processing', dECE, 5, 4).lastInsertRowid;

    // 8. Teacher-Subject assignments
    const insertTS = db.prepare(`
      INSERT INTO teacher_subjects (teacher_id, subject_id, academic_year, section) VALUES (?, ?, '2026-27', 'A')
    `);
    insertTS.run(t1, subOS);
    insertTS.run(t1, subDBMS);
    insertTS.run(t1, subAI);
    insertTS.run(t2, subCN);
    insertTS.run(t2, subSE);

    // 9. Enrollments
    const insertEnroll = db.prepare(`
      INSERT INTO enrollments (student_id, subject_id, academic_year) VALUES (?, ?, '2026-27')
    `);
    for (const subId of [subOS, subDBMS, subCN, subSE, subAI]) {
      insertEnroll.run(s1, subId);
      insertEnroll.run(s2, subId);
    }
    insertEnroll.run(s3, subDSP);

    // 10. Attendance Records (realistic sessions across Oct-Nov 2026)
    const insertAtt = db.prepare(`
      INSERT INTO attendance (student_id, subject_id, session_date, session_slot, status, marked_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const seedSubjectAttendance = (
      studentId: number | bigint,
      subjectId: number | bigint,
      total: number,
      presentCount: number,
      marker: number | bigint
    ) => {
      for (let i = 0; i < total; i++) {
        const day = 1 + (i % 28);
        const month = i < 15 ? '10' : '11';
        const dateStr = `2026-${month}-${String(day).padStart(2, '0')}`;
        const slot = i >= 28 ? 'Afternoon' : 'Morning';
        const status = i < presentCount ? 'present' : 'absent';
        insertAtt.run(studentId, subjectId, dateStr, slot, status, marker);
      }
    };
    // Aarav Sharma: CS501 (26/30 = 86.7%), CS502 (19/28 = 67.86% SHORTAGE), CS503 (23/27 = 85.2%), CS504 (20/26 = 76.9%), CS505 (22/25 = 88%)
    seedSubjectAttendance(s1, subOS, 30, 26, uTeacher1);
    seedSubjectAttendance(s1, subDBMS, 28, 19, uTeacher1);
    seedSubjectAttendance(s1, subCN, 27, 23, uTeacher2);
    seedSubjectAttendance(s1, subSE, 26, 20, uTeacher2);
    seedSubjectAttendance(s1, subAI, 25, 22, uTeacher1);

    // Diya Nair: strong attendance across all
    seedSubjectAttendance(s2, subOS, 30, 28, uTeacher1);
    seedSubjectAttendance(s2, subDBMS, 28, 27, uTeacher1);
    seedSubjectAttendance(s2, subCN, 27, 25, uTeacher2);
    seedSubjectAttendance(s2, subSE, 26, 24, uTeacher2);
    seedSubjectAttendance(s2, subAI, 25, 24, uTeacher1);

    // Karthik Rao
    seedSubjectAttendance(s3, subDSP, 24, 17, uTeacher2);

    // 11. Exams & Marks
    const insertExam = db.prepare(`
      INSERT INTO exams (name, exam_type, max_marks, academic_year, exam_date) VALUES (?, ?, ?, '2026-27', ?)
    `);
    const exIA1 = insertExam.run('Internal Assessment 1', 'internal', 25, '2026-09-18').lastInsertRowid;
    const exIA2 = insertExam.run('Internal Assessment 2', 'internal', 25, '2026-10-22').lastInsertRowid;
    const exMid = insertExam.run('Mid-Semester Examination', 'midterm', 50, '2026-11-04').lastInsertRowid;

    const insertMark = db.prepare(`
      INSERT INTO marks (student_id, subject_id, exam_id, marks_obtained, published, entered_by)
      VALUES (?, ?, ?, ?, 1, ?)
    `);
    // Aarav Sharma
    insertMark.run(s1, subOS, exIA1, 22, uTeacher1);
    insertMark.run(s1, subOS, exIA2, 23, uTeacher1);
    insertMark.run(s1, subOS, exMid, 44, uTeacher1);

    insertMark.run(s1, subDBMS, exIA1, 17, uTeacher1);
    insertMark.run(s1, subDBMS, exIA2, 16, uTeacher1);
    insertMark.run(s1, subDBMS, exMid, 33, uTeacher1);

    insertMark.run(s1, subCN, exIA1, 21, uTeacher2);
    insertMark.run(s1, subCN, exIA2, 22, uTeacher2);
    insertMark.run(s1, subCN, exMid, 41, uTeacher2);

    insertMark.run(s1, subSE, exIA1, 20, uTeacher2);
    insertMark.run(s1, subSE, exIA2, 21, uTeacher2);
    insertMark.run(s1, subSE, exMid, 42, uTeacher2);

    insertMark.run(s1, subAI, exIA1, 24, uTeacher1);
    insertMark.run(s1, subAI, exIA2, 23, uTeacher1);
    insertMark.run(s1, subAI, exMid, 46, uTeacher1);

    // Diya Nair
    insertMark.run(s2, subOS, exIA1, 24, uTeacher1);
    insertMark.run(s2, subOS, exIA2, 24, uTeacher1);
    insertMark.run(s2, subOS, exMid, 47, uTeacher1);
    insertMark.run(s2, subDBMS, exIA1, 23, uTeacher1);
    insertMark.run(s2, subDBMS, exIA2, 24, uTeacher1);
    insertMark.run(s2, subDBMS, exMid, 46, uTeacher1);
    insertMark.run(s2, subCN, exIA1, 23, uTeacher2);
    insertMark.run(s2, subAI, exIA1, 25, uTeacher1);

    // 12. Weekly Timetable (CSE Sem 5)
    const insertSlot = db.prepare(`
      INSERT INTO timetable (department_id, semester, day_of_week, start_time, end_time, subject_id, teacher_id, room, is_free_period, published)
      VALUES (?, 5, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertSlot.run(dCSE, 'Monday', '09:00', '10:00', subOS, t1, 'LH-301', 0);
    insertSlot.run(dCSE, 'Monday', '10:00', '11:00', subDBMS, t1, 'LH-301', 0);
    insertSlot.run(dCSE, 'Monday', '11:15', '12:15', subCN, t2, 'LH-302', 0);
    insertSlot.run(dCSE, 'Monday', '14:00', '15:00', null, null, 'Library', 1);

    insertSlot.run(dCSE, 'Tuesday', '09:00', '10:00', subAI, t1, 'AI-Lab-1', 0);
    insertSlot.run(dCSE, 'Tuesday', '10:00', '11:00', subSE, t2, 'LH-301', 0);
    insertSlot.run(dCSE, 'Tuesday', '11:15', '12:15', subOS, t1, 'LH-301', 0);

    insertSlot.run(dCSE, 'Wednesday', '09:00', '10:00', subDBMS, t1, 'DB-Lab-2', 0);
    insertSlot.run(dCSE, 'Wednesday', '10:00', '11:00', subCN, t2, 'LH-302', 0);
    insertSlot.run(dCSE, 'Wednesday', '11:15', '12:15', null, null, 'Study Hall', 1);

    insertSlot.run(dCSE, 'Thursday', '09:00', '10:00', subSE, t2, 'LH-301', 0);
    insertSlot.run(dCSE, 'Thursday', '10:00', '11:00', subAI, t1, 'LH-304', 0);
    insertSlot.run(dCSE, 'Thursday', '14:00', '15:00', subOS, t1, 'LH-301', 0);

    insertSlot.run(dCSE, 'Friday', '09:00', '10:00', subCN, t2, 'Net-Lab-1', 0);
    insertSlot.run(dCSE, 'Friday', '10:00', '11:00', subDBMS, t1, 'LH-301', 0);
    insertSlot.run(dCSE, 'Friday', '11:15', '12:15', subAI, t1, 'LH-304', 0);

    // 13. Fees & Invoices
    const insertFeeType = db.prepare(`INSERT INTO fee_types (name, description, default_amount) VALUES (?, ?, ?)`);
    const ftTuition = insertFeeType.run('Annual Tuition Fee', 'Semester 5 & 6 academic tuition and lab access', 92000).lastInsertRowid;
    const ftExam = insertFeeType.run('Examination Registration Fee', 'End-semester university assessment fee', 3500).lastInsertRowid;
    const ftLibrary = insertFeeType.run('Digital Library & Computing Fee', 'Campus cloud & IEEE/ACM portal access', 4500).lastInsertRowid;

    const insertInv = db.prepare(`
      INSERT INTO fee_invoices (student_id, fee_type_id, invoice_number, amount_due, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const inv1 = insertInv.run(s1, ftTuition, 'INV-2026-1001', 92000, '2026-08-15', 'paid').lastInsertRowid;
    const inv2 = insertInv.run(s1, ftLibrary, 'INV-2026-1044', 4500, '2026-09-30', 'paid').lastInsertRowid;
    insertInv.run(s1, ftExam, 'INV-2026-1192', 3500, '2026-11-25', 'unpaid');
    const inv4 = insertInv.run(s2, ftTuition, 'INV-2026-1002', 92000, '2026-08-15', 'paid').lastInsertRowid;

    const insertPay = db.prepare(`
      INSERT INTO fee_payments (invoice_id, amount_paid, payment_date, payment_mode, reference_number, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertPay.run(inv1, 92000, '2026-08-10', 'Bank NEFT (Verified)', 'NEFT-MIT-889120', uAdmin);
    insertPay.run(inv2, 4500, '2026-09-21', 'Campus Challan', 'CHL-MIT-441209', uAdmin);
    insertPay.run(inv4, 92000, '2026-08-11', 'Bank NEFT (Verified)', 'NEFT-MIT-889211', uAdmin);

    // 14. Assignments & Submissions
    const insertAsg = db.prepare(`
      INSERT INTO assignments (subject_id, teacher_id, title, instructions, due_date, max_score)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const a1 = insertAsg.run(
      subOS,
      t1,
      'CPU Scheduling Simulator & Analysis',
      'Implement Round-Robin and Shortest Remaining Time First scheduling in C or Python. Submit turnaround time and waiting time comparisons.',
      '2026-11-20',
      20
    ).lastInsertRowid;
    const a2 = insertAsg.run(
      subDBMS,
      t1,
      'B+ Tree Indexing & Query Optimization Report',
      'Analyze query execution plans before and after composite index creation on a 100k-row relational dataset.',
      '2026-11-18',
      20
    ).lastInsertRowid;
    const a3 = insertAsg.run(
      subCN,
      t2,
      'TCP Congestion Control Lab Trace',
      'Capture and annotate slow-start and congestion avoidance phases from the provided packet trace.',
      '2026-11-24',
      20
    ).lastInsertRowid;

    const insertSub = db.prepare(`
      INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_name, status, score, feedback)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertSub.run(
      a1,
      s1,
      'Implemented RR (quantum=4ms) and SRTF in Python with matplotlib Gantt visualization.',
      'aarav_os_scheduler.pdf',
      'graded',
      18,
      'Well-structured comparison. Edge case for zero-burst arrival handled cleanly.'
    );
    insertSub.run(
      a1,
      s2,
      'Submitted C++ implementation with empirical latency benchmarks.',
      'diya_scheduler.pdf',
      'submitted',
      null,
      null
    );

    // 15. Companies & Placement Drives
    const insertComp = db.prepare(`
      INSERT INTO companies (name, industry, location, website, description)
      VALUES (?, ?, ?, ?, ?)
    `);
    const c1 = insertComp.run('Veltrix Systems', 'Enterprise Cloud Infrastructure', 'Bengaluru', 'https://veltrix.example', 'Cloud telemetry & distributed storage systems').lastInsertRowid;
    const c2 = insertComp.run('Aether Semiconductor', 'VLSI & Embedded Systems', 'Hyderabad', 'https://aether.example', 'Automotive SoC and firmware engineering').lastInsertRowid;
    const c3 = insertComp.run('Kaveri FinTech', 'Financial Platforms', 'Mumbai / Bengaluru', 'https://kaverifintech.example', 'High-throughput payment settlement architecture').lastInsertRowid;

    const insertDrive = db.prepare(`
      INSERT INTO placement_drives (company_id, role_title, package_lpa, min_cgpa, max_backlogs, allowed_departments, min_semester, drive_date, application_deadline, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `);
    const pd1 = insertDrive.run(c1, 'Software Development Engineer Intern', '14.5 LPA', 7.5, 0, 'CSE,ECE', 5, '2026-12-05', '2026-11-28').lastInsertRowid;
    insertDrive.run(c2, 'Embedded Firmware Trainee', '11.0 LPA', 7.0, 0, 'ECE,CSE', 5, '2026-12-10', '2026-12-01');
    insertDrive.run(c3, 'Associate Backend Engineer', '18.0 LPA', 8.5, 0, 'CSE', 5, '2026-12-15', '2026-12-04');

    db.prepare(`INSERT INTO placement_applications (drive_id, student_id, status) VALUES (?, ?, 'shortlisted')`).run(pd1, s1);

    // 16. Announcements
    const insertAnn = db.prepare(`
      INSERT INTO announcements (title, body, category, department_id, target_role, published_by, publish_date, expiry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published')
    `);
    insertAnn.run(
      'End-Semester Examination Form Submission Window',
      'Students in Semesters 3, 5, and 7 must verify their attendance and clear examination registration invoices on or before November 25, 2026.',
      'examination',
      null,
      'student',
      uAdmin,
      '2026-11-10',
      '2026-11-26'
    );
    insertAnn.run(
      'CSE Department Technical Symposium & Project Expo',
      'All 5th-semester CSE students are invited to submit project abstracts for the Winter Academic Showcase by November 30, 2026.',
      'department',
      dCSE,
      'all',
      uAdmin,
      '2026-11-08',
      '2026-12-01'
    );
    insertAnn.run(
      'Faculty Academic Council Review Meeting',
      'Internal Assessment 2 moderation and attendance shortage review will convene in Senate Hall B on November 16 at 15:30.',
      'college',
      null,
      'teacher',
      uAdmin,
      '2026-11-11',
      '2026-11-17'
    );

    // 17. Pre-seeded Institutional Policy Documents & Chunks (for immediate RAG grounding)
    const insertDoc = db.prepare(`
      INSERT INTO documents (title, category, department_id, academic_year, access_role, file_name, file_size_bytes, page_count, version, processing_status, uploaded_by)
      VALUES (?, ?, ?, '2026-27', ?, ?, ?, ?, 1, 'ready', ?)
    `);
    const insertChunk = db.prepare(`
      INSERT INTO document_chunks (document_id, chunk_index, page_number, content, embedding_json)
      VALUES (?, ?, ?, ?, NULL)
    `);

    const doc1Pages = [
      {
        pageNumber: 1,
        text: 'Meridian Institute of Technology (Demonstration Policy) — Academic & Attendance Regulations 2026-27. Section 1.1 Minimum Attendance Requirement: Every student is required to maintain a minimum of 75% attendance in each registered theory and laboratory course individually, calculated from the commencement of classes to the last instructional day.',
      },
      {
        pageNumber: 2,
        text: 'Section 1.2 Attendance Shortage & Condonation Policy: Students whose attendance falls between 65% and 74.99% due to documented medical emergencies or official university representation may apply for condonation with supporting certificates signed by the Head of Department and approved by the Academic Registrar. Attendance strictly below 65% results in detention from the End-Semester Examination for that specific course.',
      },
      {
        pageNumber: 3,
        text: 'Section 2.1 Academic Integrity & Leave Notification: Planned academic leave requires prior written intimation to the faculty advisor at least 3 working days in advance. Medical leave certificates must be submitted within 5 working days of resuming classes.',
      },
    ];
    const d1 = insertDoc.run(
      'Academic & Attendance Regulations 2026-27',
      'regulations',
      null,
      'all',
      'Academic_Attendance_Regulations_2026_27.pdf',
      245120,
      3,
      uAdmin
    ).lastInsertRowid;
    for (const chunk of chunkDocumentText(doc1Pages, 800, 120)) {
      insertChunk.run(d1, chunk.chunkIndex, chunk.pageNumber, chunk.content);
    }

    const doc2Pages = [
      {
        pageNumber: 1,
        text: 'Examination & Continuous Internal Evaluation Handbook 2026-27. Section 3.1 Assessment Weightage: Continuous Internal Evaluation (CIE) accounts for 50% of the total course grade, comprising Internal Assessment 1 (25 marks), Internal Assessment 2 (25 marks), Mid-Semester Exam (50 marks scaled), and Assignments (20 marks scaled). The End-Semester Examination accounts for the remaining 50%.',
      },
      {
        pageNumber: 2,
        text: 'Section 3.2 Grading Scale: O (Outstanding, 90-100%, 10 points), A+ (Excellent, 80-89%, 9 points), A (Very Good, 70-79%, 8 points), B+ (Good, 60-69%, 7 points), B (Above Average, 50-59%, 6 points), C (Pass, 40-49%, 5 points), F (Fail, below 40%, 0 points). Minimum 40% aggregate is required to pass a course.',
      },
    ];
    const d2 = insertDoc.run(
      'Examination & Grading Handbook 2026-27',
      'handbook',
      null,
      'all',
      'Examination_Grading_Handbook_2026_27.pdf',
      198400,
      2,
      uAdmin
    ).lastInsertRowid;
    for (const chunk of chunkDocumentText(doc2Pages, 800, 120)) {
      insertChunk.run(d2, chunk.chunkIndex, chunk.pageNumber, chunk.content);
    }

    const doc3Pages = [
      {
        pageNumber: 1,
        text: 'Campus Placement & Internship Policy 2026-27. Section 4.1 Eligibility & Registration: Students entering the 5th semester onwards with zero active backlogs (unless explicitly relaxed by the visiting recruiter) and minimum CGPA matching the company criteria may apply through the CampusGPT Placement Portal. Once a student receives a Dream Tier offer (>= 12 LPA), they are permitted one additional upgrade attempt in Super-Dream drives (>= 18 LPA).',
      },
    ];
    const d3 = insertDoc.run(
      'Campus Placement & Internship Policy 2026-27',
      'placement_policy',
      null,
      'all',
      'Placement_Internship_Policy_2026_27.pdf',
      142000,
      1,
      uAdmin
    ).lastInsertRowid;
    for (const chunk of chunkDocumentText(doc3Pages, 800, 120)) {
      insertChunk.run(d3, chunk.chunkIndex, chunk.pageNumber, chunk.content);
    }

    // 18. Notifications
    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, is_read, source_mode)
      VALUES (?, ?, ?, ?, 0, 'session_generated')
    `);
    insertNotif.run(
      uStudent1,
      'attendance',
      'Attendance Shortage Alert: CS502',
      'Your attendance in Database Management Systems (CS502) is 67.86%, below the 75% institutional requirement.'
    );
    insertNotif.run(
      uStudent1,
      'fee',
      'Upcoming Fee Due: INV-2026-1192',
      'Examination Registration Fee of INR 3,500 is due on November 25, 2026.'
    );
    insertNotif.run(
      uStudent1,
      'assignment',
      'Assignment Due Soon: CS502',
      'B+ Tree Indexing & Query Optimization Report is due on November 18, 2026.'
    );

    // 19. Audit Log initial record
    db.prepare(`
      INSERT INTO audit_logs (actor_user_id, actor_email, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, 'SYSTEM_SEED', 'database', 'initial', 'Initialized Meridian Institute of Technology demonstration dataset.', '127.0.0.1')
    `).run(uAdmin, 'admin.registrar@meridian.edu.in');
  });

  runSeed();
}
