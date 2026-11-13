import React, { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, ClipboardCheck, Plus, Search, Sparkles, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { AuthUser } from '../types/campus';
import { useToast } from './ToastProvider';

export type TeacherSection = 'overview' | 'students' | 'attendance' | 'marks' | 'assignments' | 'timetable';

interface TeacherDashboardProps {
  user: AuthUser;
  section: TeacherSection;
  onNavigate: (sec: TeacherSection) => void;
  onOpenAIWithPrompt: (prompt: string) => void;
}

export function TeacherDashboard({ user, section, onNavigate, onOpenAIWithPrompt }: TeacherDashboardProps) {
  const { notify } = useToast();
  const [overview, setOverview] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(0);

  // Attendance form state
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attSlot, setAttSlot] = useState('Morning');
  const [attMap, setAttMap] = useState<Record<number, 'present' | 'absent'>>({});

  // Marks form state
  const [selectedExamId, setSelectedExamId] = useState<number>(0);
  const [marksGrid, setMarksGrid] = useState<any>(null);
  const [marksDraft, setMarksDraft] = useState<Record<number, string>>({});

  // Assignment state
  const [assignments, setAssignments] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [newDueDate, setNewDueDate] = useState('2026-11-30');
  const [newMaxScore, setNewMaxScore] = useState(20);
  const [activeSubmissions, setActiveSubmissions] = useState<any>(null);
  const [gradeDrafts, setGradeDrafts] = useState<Record<number, { score: string; feedback: string }>>({});

  const loadOverview = async () => {
    setLoadError(null);
    try {
      const ov = await apiFetch('/api/teacher/overview');
      setOverview(ov);
      if (ov.subjects?.[0] && !selectedSubjectId) {
        setSelectedSubjectId(ov.subjects[0].id);
      }
      if (ov.exams?.[0] && !selectedExamId) {
        setSelectedExamId(ov.exams[0].id);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load faculty overview.';
      setLoadError(msg);
      notify(msg, 'error');
    }
  };

  const loadStudents = async (subjectId = selectedSubjectId, q = searchQ) => {
    try {
      const qs = new URLSearchParams();
      if (subjectId) qs.set('subjectId', String(subjectId));
      if (q) qs.set('q', q);
      const res = await apiFetch(`/api/teacher/students?${qs.toString()}`);
      setStudents(res.students);
      const initialAtt: Record<number, 'present' | 'absent'> = {};
      for (const s of res.students) {
        initialAtt[s.student_id] = 'present';
      }
      setAttMap(initialAtt);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const loadMarks = async (subId = selectedSubjectId, exId = selectedExamId) => {
    if (!subId || !exId) return;
    try {
      const res = await apiFetch(`/api/teacher/marks?subjectId=${subId}&examId=${exId}`);
      setMarksGrid(res);
      const draft: Record<number, string> = {};
      for (const s of res.students) {
        draft[s.student_id] = s.marks_obtained != null ? String(s.marks_obtained) : '';
      }
      setMarksDraft(draft);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const loadAssignments = async () => {
    try {
      const res = await apiFetch('/api/teacher/assignments');
      setAssignments(res.assignments);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  useEffect(() => {
    loadOverview();
    loadAssignments();
  }, []);

  useEffect(() => {
    if (selectedSubjectId) {
      loadStudents(selectedSubjectId, searchQ);
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    if (selectedSubjectId && selectedExamId && section === 'marks') {
      loadMarks(selectedSubjectId, selectedExamId);
    }
  }, [selectedSubjectId, selectedExamId, section]);

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    const entries = students.map((s) => ({
      studentId: s.student_id,
      status: attMap[s.student_id] || 'present',
    }));
    try {
      const res = await apiFetch('/api/teacher/attendance/session', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: selectedSubjectId,
          sessionDate: attDate,
          sessionSlot: attSlot,
          entries,
        }),
      });
      notify(res.message, 'success');
      loadStudents(selectedSubjectId, searchQ);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleSaveMarks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marksGrid) return;
    const entries = marksGrid.students
      .filter((s: any) => marksDraft[s.student_id] !== '')
      .map((s: any) => ({
        studentId: s.student_id,
        marksObtained: Number(marksDraft[s.student_id]),
      }));
    if (entries.length === 0) {
      notify('Enter marks for at least one student.', 'warning');
      return;
    }
    try {
      const res = await apiFetch('/api/teacher/marks', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: selectedSubjectId,
          examId: selectedExamId,
          published: Boolean(user.canPublishResults),
          entries,
        }),
      });
      notify(res.message, 'success');
      loadMarks(selectedSubjectId, selectedExamId);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/teacher/assignments', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: selectedSubjectId,
          title: newTitle,
          instructions: newInstructions,
          dueDate: newDueDate,
          maxScore: newMaxScore,
        }),
      });
      notify('Assignment created.', 'success');
      setNewTitle('');
      setNewInstructions('');
      loadAssignments();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const openSubmissions = async (assignmentId: number) => {
    try {
      const res = await apiFetch(`/api/teacher/assignments/${assignmentId}/submissions`);
      setActiveSubmissions(res);
      const drafts: Record<number, { score: string; feedback: string }> = {};
      for (const s of res.submissions) {
        drafts[s.id] = {
          score: s.score != null ? String(s.score) : '',
          feedback: s.feedback || '',
        };
      }
      setGradeDrafts(drafts);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleGrade = async (subId: number) => {
    const draft = gradeDrafts[subId];
    if (!draft || draft.score === '') return;
    try {
      await apiFetch(`/api/teacher/submissions/${subId}/grade`, {
        method: 'POST',
        body: JSON.stringify({ score: Number(draft.score), feedback: draft.feedback }),
      });
      notify('Submission graded.', 'success');
      if (activeSubmissions) openSubmissions(activeSubmissions.assignment.id);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center space-y-3">
        <p className="font-display text-base font-semibold text-slate-950">Unable to load faculty portal</p>
        <p className="text-sm text-red-700">{loadError}</p>
        <button
          type="button"
          onClick={loadOverview}
          className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  if (!overview) {
    return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;
  }

  if (section === 'overview') {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-950">{user.fullName}</h1>
            <p className="mt-1 text-xs text-slate-600 font-mono">
              {user.collegeId} · {user.designation} · {user.departmentName}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenAIWithPrompt('Which students in my assigned classes have attendance below the required threshold?')}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              <Sparkles className="h-4 w-4" />
              Teacher AI Insights
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Assigned Subjects</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-950">{overview.subjects.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Pending Submissions</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-amber-700">
              {overview.pendingGradingCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Attendance Policy</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-950">
              {overview.requiredAttendancePct}%
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-base font-semibold text-slate-950">Assigned Subjects &amp; Classes</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {overview.subjects.map((sub: any) => (
              <div key={sub.id} className="rounded-lg border border-slate-200 p-4">
                <p className="font-mono text-xs text-blue-700">{sub.code} · {sub.department_code} Sem {sub.semester}</p>
                <p className="mt-1 font-semibold text-slate-900">{sub.name}</p>
                <p className="mt-1 text-xs text-slate-500">{sub.student_count} enrolled students · Section {sub.section}</p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubjectId(sub.id);
                      onNavigate('attendance');
                    }}
                    className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Mark Attendance
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubjectId(sub.id);
                      onNavigate('marks');
                    }}
                    className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Enter Marks
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (section === 'students') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-xl font-bold text-slate-950">Authorized Class Students</h1>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filter by subject"
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium"
            >
              {overview.subjects.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="search"
                value={searchQ}
                onChange={(e) => {
                  setSearchQ(e.target.value);
                  loadStudents(selectedSubjectId, e.target.value);
                }}
                placeholder="Search ID or name..."
                className="rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-xs"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3 text-right">Attendance</th>
                <th className="px-5 py-3 text-right">CGPA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st) => (
                <tr key={`${st.student_id}-${st.subject_id}`}>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700">{st.college_id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{st.full_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{st.subject_code}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                    <span className={st.attendance.status === 'shortage' ? 'text-red-700 font-semibold' : 'text-slate-800'}>
                      {st.attendance.currentPercentage}% ({st.attendance.attended}/{st.attendance.conducted})
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-700">{st.cgpa}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section === 'attendance') {
    return (
      <form onSubmit={handleSaveAttendance} className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="font-display text-xl font-bold text-slate-950">Record Class Attendance</h1>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Assigned Subject</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {overview.subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Session Date</label>
              <input
                type="date"
                required
                value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Slot</label>
              <select
                value={attSlot}
                onChange={(e) => setAttSlot(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="Morning">Morning</option>
                <option value="Midday">Midday</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Lab">Lab Session</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Student ID</th>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3 text-right">Current %</th>
                <th className="px-5 py-3 text-right">Session Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.student_id}>
                  <td className="px-5 py-3 font-mono text-xs">{s.college_id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.full_name}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                    {s.attendance.currentPercentage}%
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                      {(['present', 'absent'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setAttMap({ ...attMap, [s.student_id]: st })}
                          className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                            (attMap[s.student_id] || 'present') === st
                              ? st === 'present'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-red-600 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              <ClipboardCheck className="h-4 w-4" />
              Save Attendance Session
            </button>
          </div>
        </div>
      </form>
    );
  }

  if (section === 'marks') {
    return (
      <form onSubmit={handleSaveMarks} className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-xl font-bold text-slate-950">Marks Management</h1>
              <p className="mt-1 text-xs text-slate-600">
                Maximum marks validation enforced server-side.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenAIWithPrompt('Explain why students may be struggling in my assigned subjects based on available marks.')}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-800"
            >
              <Sparkles className="h-4 w-4" />
              Analyze Class Marks
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">Subject</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {overview.subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Examination</label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {overview.exams.map((ex: any) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} (Max {ex.max_marks})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {marksGrid && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Student ID</th>
                  <th className="px-4 py-3">Student Name</th>
                  <th className="px-5 py-3 text-right">Marks (Max {marksGrid.exam.max_marks})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {marksGrid.students.map((st: any) => (
                  <tr key={st.student_id}>
                    <td className="px-5 py-3 font-mono text-xs">{st.college_id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{st.full_name}</td>
                    <td className="px-5 py-3 text-right">
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={marksGrid.exam.max_marks}
                        value={marksDraft[st.student_id] ?? ''}
                        onChange={(e) => setMarksDraft({ ...marksDraft, [st.student_id]: e.target.value })}
                        className="w-24 rounded-lg border border-slate-300 px-3 py-1 text-right font-mono text-sm tabular-nums"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                Validate &amp; Save Marks
              </button>
            </div>
          </div>
        )}
      </form>
    );
  }

  if (section === 'assignments') {
    return (
      <div className="space-y-6">
        <form onSubmit={handleCreateAssignment} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h1 className="font-display text-lg font-bold text-slate-950">Create New Assignment</h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Subject</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {overview.subjects.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Due Date</label>
              <input
                type="date"
                required
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Max Score</label>
              <input
                type="number"
                min={1}
                max={200}
                required
                value={newMaxScore}
                onChange={(e) => setNewMaxScore(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Assignment Title</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Deadlock Prevention & Banker's Algorithm Lab"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Instructions</label>
            <textarea
              rows={2}
              required
              value={newInstructions}
              onChange={(e) => setNewInstructions(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            Publish Assignment
          </button>
        </form>

        <div className="space-y-3">
          {assignments.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">
                  {a.subject_code} · Due {a.due_date} · {a.submission_count}/{a.total_students} submitted
                </p>
                <p className="mt-1 font-semibold text-slate-950">{a.title}</p>
              </div>
              <button
                type="button"
                onClick={() => openSubmissions(a.id)}
                className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Review Submissions
              </button>
            </div>
          ))}
        </div>

        {activeSubmissions && (
          <div className="rounded-xl border border-blue-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-950">
              Submissions — {activeSubmissions.assignment.title}
            </h2>
            {activeSubmissions.submissions.length === 0 ? (
              <p className="text-sm text-slate-500">No student submissions yet.</p>
            ) : (
              activeSubmissions.submissions.map((sub: any) => (
                <div key={sub.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">
                      {sub.student_name} ({sub.college_id})
                    </span>
                    <span className="capitalize text-blue-700">{sub.status}</span>
                  </div>
                  <p className="text-sm text-slate-700">{sub.submission_text}</p>
                  {sub.file_name && <p className="text-xs font-mono text-slate-500">Attachment: {sub.file_name}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={activeSubmissions.assignment.max_score}
                      placeholder="Score"
                      value={gradeDrafts[sub.id]?.score || ''}
                      onChange={(e) =>
                        setGradeDrafts({
                          ...gradeDrafts,
                          [sub.id]: { ...gradeDrafts[sub.id], score: e.target.value },
                        })
                      }
                      className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Feedback for student..."
                      value={gradeDrafts[sub.id]?.feedback || ''}
                      onChange={(e) =>
                        setGradeDrafts({
                          ...gradeDrafts,
                          [sub.id]: { ...gradeDrafts[sub.id], feedback: e.target.value },
                        })
                      }
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleGrade(sub.id)}
                      className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white"
                    >
                      Save Grade
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // TIMETABLE
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="font-display text-xl font-bold text-slate-950">Assigned Teaching Schedule</h1>
      <div className="mt-4 divide-y divide-slate-100">
        {overview.timetable.map((slot: any) => (
          <div key={slot.id} className="py-3 flex items-center justify-between text-sm">
            <div>
              <p className="font-medium text-slate-900">
                {slot.day_of_week} · {slot.subject_code} {slot.subject_name}
              </p>
              <p className="text-xs text-slate-500">
                {slot.department_code} Semester {slot.semester} · Room {slot.room}
              </p>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-700">
              {slot.start_time} – {slot.end_time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
