import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAttendanceMetrics,
  calculateAcademicPerformance,
  evaluatePlacementEligibility,
  chunkDocumentText,
  cosineSimilarity,
  checkTimetableConflict,
} from './academicMath';

test('attendance calculator computes safe miss count accurately', () => {
  // 27 / 30 = 90%; at 75% required, max total classes = floor(27 / 0.75) = 36 => can miss 6
  const res = calculateAttendanceMetrics(27, 30, 75);
  assert.equal(res.currentPercentage, 90);
  assert.equal(res.status, 'safe');
  assert.equal(res.classesCanMiss, 6);
  assert.equal(res.classesNeededToRecover, 0);
});

test('attendance calculator computes recovery classes needed when below threshold', () => {
  // 20 / 30 = 66.67%; at 75%, need (0.75*30 - 20)/0.25 = 2.5 / 0.25 = 10 consecutive classes => 30/40 = 75%
  const res = calculateAttendanceMetrics(20, 30, 75);
  assert.equal(res.status, 'shortage');
  assert.equal(res.classesCanMiss, 0);
  assert.equal(res.classesNeededToRecover, 10);
});

test('attendance calculator respects custom configurable threshold (85%)', () => {
  const res = calculateAttendanceMetrics(17, 20, 85);
  assert.equal(res.currentPercentage, 85);
  assert.equal(res.classesCanMiss, 0);
});

test('academic performance summarizes marks and grades deterministically', () => {
  const perf = calculateAcademicPerformance([
    { subjectCode: 'CS501', subjectName: 'Operating Systems', examName: 'IA-1', marksObtained: 45, maxMarks: 50 },
    { subjectCode: 'CS502', subjectName: 'Database Systems', examName: 'IA-1', marksObtained: 30, maxMarks: 50 },
  ]);
  assert.equal(perf.overallPercentage, 75);
  assert.equal(perf.letterGrade, 'A');
  assert.equal(perf.strongestSubject, 'Operating Systems');
  assert.equal(perf.needsAttentionSubject, 'Database Systems');
});

test('placement eligibility enforces CGPA, backlogs, and department', () => {
  const ok = evaluatePlacementEligibility(
    { cgpa: 8.2, activeBacklogs: 0, departmentCode: 'CSE', semester: 5 },
    { minCgpa: 7.5, maxBacklogs: 0, allowedDepartments: ['CSE', 'ECE'], minSemester: 5 }
  );
  assert.equal(ok.eligible, true);
  assert.equal(ok.reasons.length, 0);

  const fail = evaluatePlacementEligibility(
    { cgpa: 6.9, activeBacklogs: 1, departmentCode: 'ME', semester: 5 },
    { minCgpa: 7.5, maxBacklogs: 0, allowedDepartments: ['CSE'], minSemester: 5 }
  );
  assert.equal(fail.eligible, false);
  assert.equal(fail.reasons.length, 3);
});

test('chunkDocumentText preserves page numbers and overlaps cleanly', () => {
  const longText = 'Sentence one about attendance policy. '.repeat(40);
  const chunks = chunkDocumentText([{ pageNumber: 3, text: longText }], 300, 50);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every((c) => c.pageNumber === 3));
});

test('cosineSimilarity returns 1 for identical vectors and 0 for orthogonal', () => {
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-6);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('checkTimetableConflict catches room, teacher, and semester collisions', () => {
  const existing = [
    { id: 1, dayOfWeek: 'Monday', startTime: '09:00', endTime: '10:00', room: 'CS-101', teacherId: 2, departmentId: 1, semester: 5 },
  ];
  assert.ok(
    checkTimetableConflict(existing, {
      dayOfWeek: 'Monday', startTime: '09:30', endTime: '10:30', room: 'CS-101', teacherId: 3, departmentId: 2, semester: 3,
    })?.includes('Room CS-101')
  );
  assert.equal(
    checkTimetableConflict(existing, {
      dayOfWeek: 'Monday', startTime: '10:00', endTime: '11:00', room: 'CS-101', teacherId: 2, departmentId: 1, semester: 5,
    }),
    null
  );
});
