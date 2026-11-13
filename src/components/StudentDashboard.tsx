import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Megaphone,
  Receipt,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiFetch, getAuthHeaders } from '../lib/api';
import { AuthUser, SupportedLanguage } from '../types/campus';
import { useToast } from './ToastProvider';

export type StudentSection =
  | 'overview'
  | 'academics'
  | 'attendance'
  | 'timetable'
  | 'fees'
  | 'assignments'
  | 'placements'
  | 'announcements'
  | 'profile';

interface StudentDashboardProps {
  user: AuthUser;
  section: StudentSection;
  onNavigate: (sec: StudentSection) => void;
  onOpenAIWithPrompt: (prompt: string) => void;
  onUserUpdated: (u: AuthUser) => void;
}

export function StudentDashboard({
  user,
  section,
  onNavigate,
  onOpenAIWithPrompt,
  onUserUpdated,
}: StudentDashboardProps) {
  const { notify } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customThreshold, setCustomThreshold] = useState<number>(75);
  const [predictedAtt, setPredictedAtt] = useState<any>(null);

  // Assignment submission state
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFile, setSubmissionFile] = useState<File | null>(null);

  // Profile form state
  const [phone, setPhone] = useState(user.phone || '');
  const [prefLang, setPrefLang] = useState<SupportedLanguage>(user.preferredLanguage);
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(user.notificationPrefs || {});

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch('/api/student/dashboard');
      setData(res);
      setCustomThreshold(res.attendance.requiredPercentage);
      setPredictedAtt(res.attendance);
    } catch (err: any) {
      const msg = err.message || 'Failed to load student dashboard.';
      setLoadError(msg);
      notify(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handlePredict = async (pct: number) => {
    setCustomThreshold(pct);
    try {
      const res = await apiFetch('/api/student/attendance/predict', {
        method: 'POST',
        body: JSON.stringify({ requiredPercentage: pct }),
      });
      setPredictedAtt(res);
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleSubmitAssignment = async (assignmentId: number) => {
    if (!submissionText.trim() && !submissionFile) {
      notify('Enter notes or select a file to submit.', 'warning');
      return;
    }
    const fd = new FormData();
    fd.append('submissionText', submissionText);
    if (submissionFile) fd.append('file', submissionFile);

    try {
      await apiFetch(`/api/student/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: fd,
      });
      notify('Assignment submitted successfully.', 'success');
      setSubmittingId(null);
      setSubmissionText('');
      setSubmissionFile(null);
      loadDashboard();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleApplyDrive = async (driveId: number) => {
    try {
      await apiFetch(`/api/student/placements/${driveId}/apply`, { method: 'POST' });
      notify('Application submitted to placement drive.', 'success');
      loadDashboard();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          phone,
          preferredLanguage: prefLang,
          notificationPrefs: notifPrefs,
        }),
      });
      onUserUpdated(res.user);
      notify('Profile and notification preferences saved.', 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetch('/api/student/marks/export', {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marks-report-${user.collegeId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      notify(err.message || 'Failed to download CSV report.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-xl bg-slate-200" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((k) => (
            <div key={k} className="h-24 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center space-y-3">
        <p className="font-display text-base font-semibold text-slate-950">Unable to load student portal</p>
        <p className="text-sm text-red-700">{loadError || 'Dashboard data unavailable.'}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  const att = predictedAtt || data.attendance;
  const shortageSubjects = att.subjects.filter((s: any) => s.status === 'shortage');
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todaysClasses = data.timetable.filter((t: any) => t.day_of_week === todayName);
  const displayToday = todaysClasses.length > 0 ? todaysClasses : data.timetable.filter((t: any) => t.day_of_week === 'Monday');
  const displayDayLabel = todaysClasses.length > 0 ? todayName : 'Monday (Next Teaching Day)';

  if (section === 'overview') {
    return (
      <div className="space-y-6">
        {/* Welcome Banner */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 font-display text-base font-bold text-white shrink-0">
              {user.fullName
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-950">Welcome back, {user.fullName}</h1>
              <p className="mt-0.5 text-xs text-slate-600 font-mono">
                {user.collegeId} · {user.departmentCode} · Semester {user.semester} · AY 2026-27
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenAIWithPrompt('How many classes can I miss while maintaining the required attendance?')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            Ask CampusGPT
          </button>
        </section>

        {/* KPI Grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => onNavigate('attendance')}
            className="rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 transition-colors"
          >
            <p className="text-xs font-medium text-slate-500">Overall Attendance</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-950">
              {data.attendance.overall.currentPercentage}%
            </p>
            <p className={`mt-1 text-xs font-medium ${shortageSubjects.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {shortageSubjects.length > 0
                ? `${shortageSubjects.length} subject(s) below ${data.attendance.requiredPercentage}%`
                : 'All subjects above threshold'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('academics')}
            className="rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 transition-colors"
          >
            <p className="text-xs font-medium text-slate-500">Exam Performance</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-950">
              {data.marks.summary.overallPercentage}%
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Grade {data.marks.summary.letterGrade} · CGPA {user.cgpa?.toFixed(2)}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('assignments')}
            className="rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 transition-colors"
          >
            <p className="text-xs font-medium text-slate-500">Active Assignments</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-950">
              {data.assignments.filter((a: any) => !a.submission_status).length} Pending
            </p>
            <p className="mt-1 text-xs text-slate-600">{data.assignments.length} total course tasks</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('fees')}
            className="rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 transition-colors"
          >
            <p className="text-xs font-medium text-slate-500">Outstanding Fees</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-950">
              INR {data.fees.outstandingBalance.toLocaleString('en-IN')}
            </p>
            <p className="mt-1 text-xs text-slate-500">Read-only ledger</p>
          </button>
        </section>

        {/* Quick Alerts + Today's Schedule */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-display text-base font-semibold text-slate-950">
                Schedule — {displayDayLabel}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('timetable')}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Weekly view
              </button>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {displayToday.map((slot: any) => (
                <div key={slot.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">
                      {slot.is_free_period ? 'Free / Library Study Period' : `${slot.subject_code} · ${slot.subject_name}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      {slot.teacher_name || 'Self-study'} · Room {slot.room}
                    </p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-slate-700">
                    {slot.start_time} – {slot.end_time}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-display text-base font-semibold text-slate-950">Recent Announcements</h2>
              <button
                type="button"
                onClick={() => onNavigate('announcements')}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                View all
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {data.announcements.slice(0, 3).map((ann: any) => (
                <div key={ann.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <p className="text-xs text-slate-500 capitalize">
                    {ann.category} · {ann.publish_date}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{ann.title}</p>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">{ann.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'attendance') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-950">Attendance &amp; Miss Allowance Predictor</h1>
            <p className="mt-1 text-sm text-slate-600">
              Deterministic calculations based on actual conducted sessions and configurable policy ({att.requiredPercentage}% default).
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="att-threshold" className="text-xs font-medium text-slate-700 whitespace-nowrap">
              Required %
            </label>
            <input
              id="att-threshold"
              type="number"
              min={50}
              max={95}
              value={customThreshold}
              onChange={(e) => handlePredict(Number(e.target.value) || 75)}
              className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-mono tabular-nums"
            />
          </div>
        </div>

        {/* Overall Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Overall Attendance</p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-950">
                {att.overall.currentPercentage}%{' '}
                <span className="text-sm font-normal text-slate-500">
                  ({att.overall.attended}/{att.overall.conducted} classes)
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onOpenAIWithPrompt(
                  `My attendance policy target is ${customThreshold}%. Explain how many classes I can miss or must attend per subject.`
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100"
            >
              <Sparkles className="h-4 w-4" />
              Explain with CampusGPT
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-700">{att.overall.explanation}</p>
        </div>

        {/* Subject-wise Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-4 py-3 text-right">Attended / Conducted</th>
                  <th className="px-4 py-3 text-right">Current %</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3">Miss / Recovery Allowance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {att.subjects.map((s: any) => (
                  <tr key={s.subjectId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs text-slate-500">{s.subjectCode}</span>
                      <div className="font-medium text-slate-900">{s.subjectName}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-700">
                      {s.attended} / {s.conducted}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums text-slate-950">
                      {s.currentPercentage}%
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium">
                      {s.status === 'shortage' && (
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <AlertTriangle className="h-3.5 w-3.5" /> Shortage
                        </span>
                      )}
                      {s.status === 'borderline' && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Info className="h-3.5 w-3.5" /> Borderline
                        </span>
                      )}
                      {s.status === 'safe' && (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Safe
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-700">
                      {s.status === 'shortage'
                        ? `Attend ${s.classesNeededToRecover} consecutive class(es) to reach ${att.requiredPercentage}%`
                        : `May miss up to ${s.classesCanMiss} class(es) safely`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Attendance Trend Chart */}
        {data.attendance.trend?.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-base font-semibold text-slate-950">Monthly Attendance Trend</h2>
            <div className="mt-4 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.attendance.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="percentage" stroke="#1d4ed8" strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'academics') {
    const { records, summary } = data.marks;
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-950">Academic Performance &amp; Marks</h1>
            <p className="mt-1 text-sm text-slate-600">
              Overall {summary.overallPercentage}% · Estimated CGPA {summary.estimatedCgpa} · Grade {summary.letterGrade}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Download CSV Report
            </button>
            <button
              type="button"
              onClick={() => onOpenAIWithPrompt('Analyze my current exam marks and suggest a focused study plan for my weakest subject.')}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
            >
              <Sparkles className="h-4 w-4" />
              AI Study Insights
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-base font-semibold text-slate-950">Subject Percentage Breakdown</h2>
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.subjectSummaries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="subjectCode" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="percentage" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Exam Marks Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-4 py-3">Examination</th>
                  <th className="px-4 py-3 text-right">Obtained</th>
                  <th className="px-4 py-3 text-right">Max Marks</th>
                  <th className="px-5 py-3 text-right">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r: any, idx: number) => (
                  <tr key={idx}>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <span className="font-mono text-xs text-slate-500 mr-2">{r.subjectCode}</span>
                      {r.subjectName}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.examName}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">{r.marksObtained}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-500">{r.maxMarks}</td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums font-medium">
                      {((r.marksObtained / r.maxMarks) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'timetable') {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="font-display text-xl font-bold text-slate-950">Weekly Timetable</h1>
          <p className="mt-1 text-sm text-slate-600">
            {user.departmentCode} · Semester {user.semester} · Section {user.section}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {days.map((day) => {
            const slots = data.timetable.filter((t: any) => t.day_of_week === day);
            return (
              <div key={day} className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="font-display text-base font-semibold text-slate-950 border-b border-slate-100 pb-2">
                  {day}
                </h2>
                {slots.length === 0 ? (
                  <p className="mt-3 text-xs text-slate-500">No scheduled classes.</p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100">
                    {slots.map((slot: any) => (
                      <div key={slot.id} className="py-2.5 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {slot.is_free_period ? 'Free / Study Period' : `${slot.subject_code} — ${slot.subject_name}`}
                          </p>
                          <p className="text-xs text-slate-500">
                            {slot.teacher_name || 'Self-directed'} · Room {slot.room}
                          </p>
                        </div>
                        <span className="font-mono text-xs tabular-nums text-slate-700 shrink-0">
                          {slot.start_time}–{slot.end_time}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (section === 'fees') {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <strong>Read-Only Fee Ledger:</strong> {data.fees.readOnlyNotice} Contact the Accounts Office for verified receipt entry.
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Total Payable</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-950">
              INR {data.fees.totalPayable.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Amount Paid</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700">
              INR {data.fees.totalPaid.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Outstanding Balance</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-red-700">
              INR {data.fees.outstandingBalance.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5 font-display text-sm font-semibold text-slate-950">
            Invoices &amp; Due Dates
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Amount Due</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.fees.invoices.map((inv: any) => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3 font-mono text-xs text-slate-900">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-slate-800">{inv.fee_category}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{inv.due_date}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">INR {inv.amount_due.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">INR {inv.amount_paid.toLocaleString('en-IN')}</td>
                    <td className="px-5 py-3 text-xs font-medium capitalize">
                      <span className={inv.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'assignments') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="font-display text-xl font-bold text-slate-950">Course Assignments</h1>
          <p className="mt-1 text-sm text-slate-600">Submit coursework notes or attach files before due dates.</p>
        </div>

        {data.assignments.map((asg: any) => (
          <div key={asg.id} className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">
                  {asg.subject_code} · {asg.subject_name} · {asg.teacher_name} · Due {asg.due_date}
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold text-slate-950">{asg.title}</h2>
                <p className="mt-2 text-sm text-slate-700">{asg.instructions}</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-mono text-slate-600">Max Score: {asg.max_score}</p>
                <p className="mt-1 font-semibold capitalize text-blue-700">
                  {asg.submission_status || 'Not submitted'}
                </p>
              </div>
            </div>

            {asg.submission_status === 'graded' && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
                <strong>Score: {asg.score}/{asg.max_score}</strong> — {asg.feedback || 'Graded.'}
              </div>
            )}

            {asg.submission_status && asg.submission_status !== 'graded' && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
                Submitted: {asg.submission_text} {asg.file_name ? `(${asg.file_name})` : ''}
              </div>
            )}

            {submittingId === asg.id ? (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <textarea
                  rows={3}
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  placeholder="Enter summary notes or repository/solution explanation..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <input
                    type="file"
                    onChange={(e) => setSubmissionFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-600"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSubmittingId(null)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSubmitAssignment(asg.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Submit Work
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittingId(asg.id);
                    setSubmissionText(asg.submission_text || '');
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {asg.submission_status ? 'Update Submission' : 'Submit Assignment'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (section === 'placements') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-950">Campus Placements &amp; Readiness</h1>
            <p className="mt-1 text-sm text-slate-600">
              Evaluated deterministically against CGPA {user.cgpa?.toFixed(2)}, Active Backlogs ({user.activeBacklogs}), and Department ({user.departmentCode}).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenAIWithPrompt('Evaluate my placement readiness across open drives and suggest interview preparation topics.')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Sparkles className="h-4 w-4" />
            Placement AI Prep
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.placements.map((drive: any) => (
            <div key={drive.id} className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-500">
                  {drive.industry} · {drive.location} · Drive {drive.drive_date}
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold text-slate-950">
                  {drive.company_name} — {drive.role_title}
                </h2>
                <p className="mt-1 font-mono text-sm font-semibold text-blue-700">{drive.package_lpa}</p>
                <p className="mt-2 text-xs text-slate-600">
                  Criteria: Min CGPA {drive.min_cgpa} · Max Backlogs {drive.max_backlogs} · Depts {drive.allowed_departments}
                </p>

                {!drive.eligible && (
                  <p className="mt-3 text-xs text-red-700">
                    Not eligible: {drive.ineligibilityReasons.join('; ')}
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-xs font-medium text-slate-600 capitalize">
                  {drive.application_status ? `Status: ${drive.application_status}` : `Deadline: ${drive.application_deadline}`}
                </span>
                {drive.eligible && !drive.application_status && (
                  <button
                    type="button"
                    onClick={() => handleApplyDrive(drive.id)}
                    className="rounded-lg bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-800"
                  >
                    Apply Now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'announcements') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="font-display text-xl font-bold text-slate-950">College &amp; Department Announcements</h1>
        </div>
        {data.announcements.map((ann: any) => (
          <div key={ann.id} className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-xs text-slate-500 capitalize">
              {ann.category} · Published {ann.publish_date} {ann.department_code ? `· ${ann.department_code}` : '· All Departments'}
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-slate-950">{ann.title}</h2>
            <p className="mt-2 text-sm text-slate-700 leading-relaxed">{ann.body}</p>
          </div>
        ))}
      </div>
    );
  }

  // PROFILE & SETTINGS
  return (
    <form onSubmit={handleSaveProfile} className="max-w-2xl space-y-6 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-950">Student Profile &amp; Preferences</h1>
        <p className="mt-1 text-sm text-slate-600">Personal academic profile and multilingual AI settings.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm border-y border-slate-100 py-4">
        <div>
          <span className="text-xs text-slate-500">Full Name</span>
          <p className="font-medium text-slate-900">{user.fullName}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500">Student ID</span>
          <p className="font-mono font-medium text-slate-900">{user.collegeId}</p>
        </div>
        <div>
          <span className="text-xs text-slate-500">Department &amp; Semester</span>
          <p className="font-medium text-slate-900">{user.departmentName} (Sem {user.semester})</p>
        </div>
        <div>
          <span className="text-xs text-slate-500">College Email</span>
          <p className="font-medium text-slate-900">{user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="prof-phone" className="block text-sm font-medium text-slate-800">
            Contact Phone
          </label>
          <input
            id="prof-phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="prof-lang" className="block text-sm font-medium text-slate-800">
            Default AI Language
          </label>
          <select
            id="prof-lang"
            value={prefLang}
            onChange={(e) => setPrefLang(e.target.value as SupportedLanguage)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="English">English</option>
            <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
            <option value="Hindi">हिन्दी (Hindi)</option>
          </select>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-800">Notification Preferences</p>
        <p className="text-xs text-slate-500">Alerts are evaluated dynamically when you open CampusGPT.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          {['attendance', 'assignments', 'fees', 'announcements', 'placements', 'exams'].map((key) => (
            <label key={key} className="flex items-center gap-2 capitalize text-slate-700">
              <input
                type="checkbox"
                checked={notifPrefs[key] !== false}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, [key]: e.target.checked })}
                className="rounded border-slate-300 text-blue-700"
              />
              {key} alerts
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
      >
        Save Preferences
      </button>
    </form>
  );
}
