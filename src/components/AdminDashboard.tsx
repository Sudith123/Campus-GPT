import React, { useEffect, useState } from 'react';
import {
  Archive,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from '../lib/api';
import { AuthUser } from '../types/campus';
import { ConfirmDialog, useToast } from './ToastProvider';

export type AdminSection =
  | 'overview'
  | 'students'
  | 'teachers'
  | 'academics'
  | 'timetable'
  | 'fees'
  | 'announcements'
  | 'placements'
  | 'documents'
  | 'reports'
  | 'audit';

interface AdminDashboardProps {
  user: AuthUser;
  section: AdminSection;
  onOpenAIWithPrompt: (prompt: string) => void;
}

export function AdminDashboard({ section, onOpenAIWithPrompt }: AdminDashboardProps) {
  const { notify } = useToast();
  const [overview, setOverview] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [academics, setAcademics] = useState<any>({ departments: [], subjects: [], exams: [] });
  const [roster, setRoster] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [fees, setFees] = useState<any>({ feeTypes: [], invoices: [] });
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [placements, setPlacements] = useState<any>({ companies: [], drives: [], applications: [] });
  const [documents, setDocuments] = useState<any[]>([]);
  const [reports, setReports] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Form states
  const [attPolicyInput, setAttPolicyInput] = useState('75');
  const [newStu, setNewStu] = useState({ fullName: '', email: '', collegeId: '', departmentId: 1, semester: 5, cgpa: '8.0' });
  const [newTea, setNewTea] = useState({ fullName: '', email: '', collegeId: '', departmentId: 1, designation: 'Assistant Professor' });
  const [assignSub, setAssignSub] = useState({ teacherId: 0, subjectId: 0 });
  const [newRoster, setNewRoster] = useState({ collegeId: '', email: '', roleName: 'student', departmentId: 1, semester: 5 });
  const [newDept, setNewDept] = useState({ code: '', name: '', headName: '' });
  const [newSubject, setNewSubject] = useState({ code: '', name: '', departmentId: 1, semester: 5, credits: 4 });
  const [newSlot, setNewSlot] = useState({
    departmentId: 1,
    semester: 5,
    dayOfWeek: 'Monday',
    startTime: '15:00',
    endTime: '16:00',
    subjectId: 1,
    teacherId: 1,
    room: 'LH-305',
  });
  const [newInv, setNewInv] = useState({ studentId: 1, feeTypeId: 1, amountDue: '5000', dueDate: '2026-12-10' });
  const [payInvId, setPayInvId] = useState<number | null>(null);
  const [payForm, setPayForm] = useState({ amountPaid: '', paymentMode: 'Bank NEFT', referenceNumber: '' });
  const [newAnn, setNewAnn] = useState({ title: '', body: '', category: 'college', targetRole: 'all' });
  const [newComp, setNewComp] = useState({ name: '', industry: '', location: '' });
  const [newDrive, setNewDrive] = useState({
    companyId: 1,
    roleTitle: '',
    packageLpa: '',
    minCgpa: '7.0',
    maxBacklogs: '0',
    allowedDepartments: 'CSE,ECE',
    driveDate: '2026-12-20',
    applicationDeadline: '2026-12-12',
  });

  // Document upload
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('circular');
  const [docAccessRole, setDocAccessRole] = useState('all');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);

  const loadAll = async () => {
    setLoadError(null);
    try {
      const [ov, ac] = await Promise.all([apiFetch('/api/admin/overview'), apiFetch('/api/admin/academics')]);
      setOverview(ov);
      setAttPolicyInput(ov.settings?.required_attendance_pct || '75');
      setAcademics(ac);
      if (ac.departments?.[0]) {
        setNewStu((p) => ({ ...p, departmentId: ac.departments[0].id }));
        setNewTea((p) => ({ ...p, departmentId: ac.departments[0].id }));
      }
      if (ac.subjects?.[0]) {
        setAssignSub((p) => ({ ...p, subjectId: ac.subjects[0].id }));
        setNewSlot((p) => ({ ...p, subjectId: ac.subjects[0].id }));
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to load administrative overview.';
      setLoadError(msg);
      notify(msg, 'error');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (section === 'students' || section === 'fees') {
      apiFetch('/api/admin/students').then((r) => setStudents(r.students)).catch(() => {});
    }
    if (section === 'teachers' || section === 'timetable') {
      apiFetch('/api/admin/teachers').then((r) => {
        setTeachers(r.teachers);
        if (r.teachers?.[0]) {
          setAssignSub((p) => ({ ...p, teacherId: p.teacherId || r.teachers[0].teacher_id }));
          setNewSlot((p) => ({ ...p, teacherId: r.teachers[0].teacher_id }));
        }
      }).catch(() => {});
    }
    if (section === 'academics') {
      apiFetch('/api/admin/roster').then((r) => setRoster(r.roster)).catch(() => {});
    }
    if (section === 'timetable') {
      apiFetch('/api/admin/timetable').then((r) => setTimetable(r.slots)).catch(() => {});
    }
    if (section === 'fees') {
      apiFetch('/api/admin/fees').then((r) => setFees(r)).catch(() => {});
    }
    if (section === 'announcements') {
      apiFetch('/api/admin/announcements').then((r) => setAnnouncements(r.announcements)).catch(() => {});
    }
    if (section === 'placements') {
      apiFetch('/api/admin/placements').then((r) => setPlacements(r)).catch(() => {});
    }
    if (section === 'documents') {
      apiFetch('/api/admin/documents').then((r) => setDocuments(r.documents)).catch(() => {});
    }
    if (section === 'reports') {
      apiFetch('/api/admin/reports').then((r) => setReports(r)).catch(() => {});
    }
    if (section === 'audit') {
      apiFetch('/api/admin/audit-logs').then((r) => setAuditLogs(r.logs)).catch(() => {});
    }
  }, [section]);

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center space-y-3">
        <p className="font-display text-base font-semibold text-slate-950">Unable to load admin portal</p>
        <p className="text-sm text-red-700">{loadError}</p>
        <button
          type="button"
          onClick={loadAll}
          className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  if (!overview) {
    return <div className="h-44 animate-pulse rounded-xl bg-slate-200" />;
  }

  if (section === 'overview') {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-950">Institutional Command Center</h1>
            <p className="mt-1 text-sm text-slate-600">{overview.settings?.institution_name}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenAIWithPrompt('Summarize institutional metrics, department CGPA distribution, and fee collection progress.')
            }
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            <Sparkles className="h-4 w-4" />
            Executive AI Summary
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Total Students</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{overview.counts.students}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Faculty Members</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{overview.counts.teachers}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Indexed Documents (RAG)</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums">{overview.counts.documentsReady}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Fees Collected</p>
            <p className="mt-2 font-mono text-xl font-bold tabular-nums text-emerald-700">
              INR {Number(overview.feeTotals?.total_paid || 0).toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-base font-semibold text-slate-950">Department Student Distribution</h2>
            <div className="mt-4 h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.deptStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="code" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="student_count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-950">Institutional Attendance Policy</h2>
            <p className="text-xs text-slate-600">
              Configures the threshold used by the Student Attendance Predictor and AI calculations.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={50}
                max={95}
                value={attPolicyInput}
                onChange={(e) => setAttPolicyInput(e.target.value)}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await apiFetch('/api/admin/settings', {
                      method: 'PATCH',
                      body: JSON.stringify({ required_attendance_pct: Number(attPolicyInput) }),
                    });
                    notify('Attendance policy updated.', 'success');
                    loadAll();
                  } catch (err: any) {
                    notify(err.message, 'error');
                  }
                }}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                Update %
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'students') {
    return (
      <div className="space-y-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/admin/students', {
                method: 'POST',
                body: JSON.stringify({ ...newStu, cgpa: Number(newStu.cgpa) }),
              });
              notify('Student created and enrolled.', 'success');
              setNewStu({ fullName: '', email: '', collegeId: '', departmentId: 1, semester: 5, cgpa: '8.0' });
              const r = await apiFetch('/api/admin/students');
              setStudents(r.students);
            } catch (err: any) {
              notify(err.message, 'error');
            }
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h1 className="font-display text-lg font-bold text-slate-950">Create Student Account</h1>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              required
              placeholder="Full Name"
              value={newStu.fullName}
              onChange={(e) => setNewStu({ ...newStu, fullName: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              required
              placeholder="College Email"
              value={newStu.email}
              onChange={(e) => setNewStu({ ...newStu, email: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              placeholder="USN / ID (e.g. 1MIT24CS030)"
              value={newStu.collegeId}
              onChange={(e) => setNewStu({ ...newStu, collegeId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <select
              value={newStu.departmentId}
              onChange={(e) => setNewStu({ ...newStu, departmentId: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {academics.departments.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={8}
              value={newStu.semester}
              onChange={(e) => setNewStu({ ...newStu, semester: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800">
              Add Student
            </button>
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">ID</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Dept / Sem</th>
                <th className="px-4 py-3 text-right">CGPA</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st) => (
                <tr key={st.student_id}>
                  <td className="px-5 py-3 font-mono text-xs">{st.college_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{st.full_name}</div>
                    <div className="text-xs text-slate-500">{st.email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {st.department_code} · Sem {st.semester}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{st.cgpa}</td>
                  <td className="px-4 py-3 text-xs capitalize">{st.status}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={async () => {
                        const next = st.status === 'active' ? 'inactive' : 'active';
                        await apiFetch(`/api/admin/students/${st.student_id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: next }),
                        });
                        notify(`Student marked ${next}.`, 'info');
                        const r = await apiFetch('/api/admin/students');
                        setStudents(r.students);
                      }}
                      className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {st.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section === 'teachers') {
    return (
      <div className="space-y-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/admin/teachers', { method: 'POST', body: JSON.stringify(newTea) });
              notify('Faculty account created.', 'success');
              setNewTea({ fullName: '', email: '', collegeId: '', departmentId: 1, designation: 'Assistant Professor' });
              const r = await apiFetch('/api/admin/teachers');
              setTeachers(r.teachers);
            } catch (err: any) {
              notify(err.message, 'error');
            }
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h1 className="font-display text-lg font-bold text-slate-950">Add Faculty Member</h1>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              required
              placeholder="Full Name"
              value={newTea.fullName}
              onChange={(e) => setNewTea({ ...newTea, fullName: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              required
              placeholder="Faculty Email"
              value={newTea.email}
              onChange={(e) => setNewTea({ ...newTea, email: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              required
              placeholder="Employee ID (FAC-...)"
              value={newTea.collegeId}
              onChange={(e) => setNewTea({ ...newTea, collegeId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <select
              value={newTea.departmentId}
              onChange={(e) => setNewTea({ ...newTea, departmentId: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {academics.departments.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="Designation"
              value={newTea.designation}
              onChange={(e) => setNewTea({ ...newTea, designation: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
              Add Teacher
            </button>
          </div>
        </form>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch(`/api/admin/teachers/${assignSub.teacherId}/assign-subject`, {
                method: 'POST',
                body: JSON.stringify({ subjectId: assignSub.subjectId }),
              });
              notify('Subject assigned.', 'success');
              const r = await apiFetch('/api/admin/teachers');
              setTeachers(r.teachers);
            } catch (err: any) {
              notify(err.message, 'error');
            }
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 flex flex-wrap items-center gap-3"
        >
          <span className="text-sm font-semibold text-slate-900">Assign Subject:</span>
          <select
            value={assignSub.teacherId}
            onChange={(e) => setAssignSub({ ...assignSub, teacherId: Number(e.target.value) })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {teachers.map((t) => (
              <option key={t.teacher_id} value={t.teacher_id}>
                {t.full_name} ({t.college_id})
              </option>
            ))}
          </select>
          <select
            value={assignSub.subjectId}
            onChange={(e) => setAssignSub({ ...assignSub, subjectId: Number(e.target.value) })}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {academics.subjects.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            Assign
          </button>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">ID</th>
                <th className="px-4 py-3">Faculty</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-5 py-3">Assigned Subjects</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teachers.map((t) => (
                <tr key={t.teacher_id}>
                  <td className="px-5 py-3 font-mono text-xs">{t.college_id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{t.full_name}</div>
                    <div className="text-xs text-slate-500">{t.designation}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">{t.department_code}</td>
                  <td className="px-5 py-3 text-xs text-slate-700">
                    {t.assignedSubjects?.map((s: any) => s.code).join(', ') || 'None'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section === 'academics') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/admin/departments', { method: 'POST', body: JSON.stringify(newDept) });
                notify('Department added.', 'success');
                setNewDept({ code: '', name: '', headName: '' });
                loadAll();
              } catch (err: any) {
                notify(err.message, 'error');
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
          >
            <h2 className="font-display text-base font-bold text-slate-950">Add Department</h2>
            <input
              type="text"
              required
              placeholder="Code (e.g. ISE)"
              value={newDept.code}
              onChange={(e) => setNewDept({ ...newDept, code: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <input
              type="text"
              required
              placeholder="Department Name"
              value={newDept.name}
              onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Department Head"
              value={newDept.headName}
              onChange={(e) => setNewDept({ ...newDept, headName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
              Create Department
            </button>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/admin/subjects', { method: 'POST', body: JSON.stringify(newSubject) });
                notify('Subject created.', 'success');
                setNewSubject({ code: '', name: '', departmentId: 1, semester: 5, credits: 4 });
                loadAll();
              } catch (err: any) {
                notify(err.message, 'error');
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
          >
            <h2 className="font-display text-base font-bold text-slate-950">Add Subject</h2>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Code (e.g. CS506)"
                value={newSubject.code}
                onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <select
                value={newSubject.departmentId}
                onChange={(e) => setNewSubject({ ...newSubject, departmentId: Number(e.target.value) })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {academics.departments.map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.code}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              required
              placeholder="Subject Name"
              value={newSubject.name}
              onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <input
                type="number"
                min={1}
                max={8}
                value={newSubject.semester}
                onChange={(e) => setNewSubject({ ...newSubject, semester: Number(e.target.value) })}
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
                Add Subject
              </button>
            </div>
          </form>
        </div>

        {/* Authorized Registration Roster */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-950">Authorized Registration Roster</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/admin/roster', { method: 'POST', body: JSON.stringify(newRoster) });
                notify('Added to authorized roster.', 'success');
                setNewRoster({ collegeId: '', email: '', roleName: 'student', departmentId: 1, semester: 5 });
                const r = await apiFetch('/api/admin/roster');
                setRoster(r.roster);
              } catch (err: any) {
                notify(err.message, 'error');
              }
            }}
            className="grid grid-cols-1 gap-3 sm:grid-cols-5"
          >
            <input
              type="text"
              required
              placeholder="College ID"
              value={newRoster.collegeId}
              onChange={(e) => setNewRoster({ ...newRoster, collegeId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
            <input
              type="email"
              required
              placeholder="Email"
              value={newRoster.email}
              onChange={(e) => setNewRoster({ ...newRoster, email: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <select
              value={newRoster.roleName}
              onChange={(e) => setNewRoster({ ...newRoster, roleName: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
            <select
              value={newRoster.departmentId}
              onChange={(e) => setNewRoster({ ...newRoster, departmentId: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {academics.departments.map((d: any) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white">
              Approve Roster Entry
            </button>
          </form>

          <div className="divide-y divide-slate-100 text-xs">
            {roster.map((r) => (
              <div key={r.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-mono font-semibold text-slate-900">{r.college_id}</span> · {r.email} ({r.role_name})
                </div>
                <span className={r.claimed ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                  {r.claimed ? 'Registered' : 'Pending Claim'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (section === 'timetable') {
    return (
      <div className="space-y-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/admin/timetable', { method: 'POST', body: JSON.stringify(newSlot) });
              notify('Timetable slot scheduled with zero conflicts.', 'success');
              const r = await apiFetch('/api/admin/timetable');
              setTimetable(r.slots);
            } catch (err: any) {
              notify(err.message, 'error');
            }
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h1 className="font-display text-lg font-bold text-slate-950">Timetable Builder (Conflict-Checked)</h1>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <select
              value={newSlot.dayOfWeek}
              onChange={(e) => setNewSlot({ ...newSlot, dayOfWeek: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={newSlot.startTime}
              onChange={(e) => setNewSlot({ ...newSlot, startTime: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
            <input
              type="time"
              value={newSlot.endTime}
              onChange={(e) => setNewSlot({ ...newSlot, endTime: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
            <input
              type="text"
              required
              placeholder="Room (e.g. LH-301)"
              value={newSlot.room}
              onChange={(e) => setNewSlot({ ...newSlot, room: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <select
              value={newSlot.subjectId}
              onChange={(e) => setNewSlot({ ...newSlot, subjectId: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {academics.subjects.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
            <select
              value={newSlot.teacherId}
              onChange={(e) => setNewSlot({ ...newSlot, teacherId: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {teachers.map((t) => (
                <option key={t.teacher_id} value={t.teacher_id}>
                  {t.full_name}
                </option>
              ))}
            </select>
            <button type="submit" className="col-span-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
              Schedule Entry
            </button>
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Day &amp; Time</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Faculty</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3 text-right">Remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {timetable.map((slot) => (
                <tr key={slot.id}>
                  <td className="px-4 py-2.5 font-mono">
                    {slot.day_of_week} · {slot.start_time}-{slot.end_time}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {slot.subject_code ? `${slot.subject_code} ${slot.subject_name}` : 'Free Period'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{slot.teacher_name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono">{slot.room}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/timetable/${slot.id}`, { method: 'DELETE' });
                        const r = await apiFetch('/api/admin/timetable');
                        setTimetable(r.slots);
                      }}
                      aria-label={`Remove slot ${slot.id}`}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section === 'fees') {
    return (
      <div className="space-y-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/admin/fees/invoices', { method: 'POST', body: JSON.stringify(newInv) });
              notify('Fee invoice generated.', 'success');
              const r = await apiFetch('/api/admin/fees');
              setFees(r);
            } catch (err: any) {
              notify(err.message, 'error');
            }
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h1 className="font-display text-lg font-bold text-slate-950">Create Fee Invoice</h1>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <select
              value={newInv.studentId}
              onChange={(e) => setNewInv({ ...newInv, studentId: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {students.map((s) => (
                <option key={s.student_id} value={s.student_id}>
                  {s.college_id} — {s.full_name}
                </option>
              ))}
            </select>
            <select
              value={newInv.feeTypeId}
              onChange={(e) => setNewInv({ ...newInv, feeTypeId: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {fees.feeTypes.map((ft: any) => (
                <option key={ft.id} value={ft.id}>
                  {ft.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              required
              placeholder="Amount INR"
              value={newInv.amountDue}
              onChange={(e) => setNewInv({ ...newInv, amountDue: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
            />
            <input
              type="date"
              required
              value={newInv.dueDate}
              onChange={(e) => setNewInv({ ...newInv, dueDate: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
              Issue Invoice
            </button>
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fees.invoices.map((inv: any) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-mono">{inv.invoice_number}</td>
                  <td className="px-4 py-3">{inv.student_name} ({inv.college_id})</td>
                  <td className="px-4 py-3">{inv.fee_category}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">INR {inv.amount_due}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">INR {inv.amount_paid}</td>
                  <td className="px-4 py-3 capitalize font-medium">{inv.status}</td>
                  <td className="px-4 py-3 text-right">
                    {inv.status !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayInvId(inv.id);
                          setPayForm({ amountPaid: String(inv.amount_due - inv.amount_paid), paymentMode: 'Bank NEFT', referenceNumber: '' });
                        }}
                        className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                      >
                        Record Payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {payInvId && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch(`/api/admin/fees/invoices/${payInvId}/record-payment`, {
                  method: 'POST',
                  body: JSON.stringify(payForm),
                });
                notify('Payment recorded.', 'success');
                setPayInvId(null);
                const r = await apiFetch('/api/admin/fees');
                setFees(r);
              } catch (err: any) {
                notify(err.message, 'error');
              }
            }}
            className="rounded-xl border border-blue-200 bg-white p-5 flex flex-wrap items-center gap-3"
          >
            <span className="text-xs font-semibold">Record Verified Payment:</span>
            <input
              type="number"
              required
              value={payForm.amountPaid}
              onChange={(e) => setPayForm({ ...payForm, amountPaid: e.target.value })}
              className="w-28 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
            />
            <input
              type="text"
              required
              placeholder="Payment Mode"
              value={payForm.paymentMode}
              onChange={(e) => setPayForm({ ...payForm, paymentMode: e.target.value })}
              className="rounded border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              required
              placeholder="Reference / UTR #"
              value={payForm.referenceNumber}
              onChange={(e) => setPayForm({ ...payForm, referenceNumber: e.target.value })}
              className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
            />
            <button type="submit" className="rounded bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white">
              Save
            </button>
          </form>
        )}
      </div>
    );
  }

  if (section === 'announcements') {
    return (
      <div className="space-y-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/admin/announcements', { method: 'POST', body: JSON.stringify(newAnn) });
              notify('Announcement published.', 'success');
              setNewAnn({ title: '', body: '', category: 'college', targetRole: 'all' });
              const r = await apiFetch('/api/admin/announcements');
              setAnnouncements(r.announcements);
            } catch (err: any) {
              notify(err.message, 'error');
            }
          }}
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
        >
          <h1 className="font-display text-lg font-bold text-slate-950">Publish Institutional Announcement</h1>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              required
              placeholder="Announcement Title"
              value={newAnn.title}
              onChange={(e) => setNewAnn({ ...newAnn, title: e.target.value })}
              className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={newAnn.category}
              onChange={(e) => setNewAnn({ ...newAnn, category: e.target.value })}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="college">College-Wide</option>
              <option value="examination">Examination</option>
              <option value="department">Department</option>
              <option value="placement">Placement</option>
            </select>
          </div>
          <textarea
            rows={3}
            required
            placeholder="Announcement message..."
            value={newAnn.body}
            onChange={(e) => setNewAnn({ ...newAnn, body: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
            Publish Notice
          </button>
        </form>

        <div className="space-y-3">
          {announcements.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500 capitalize">
                  {a.category} · {a.publish_date} · Status: {a.status}
                </p>
                <p className="mt-1 font-semibold text-slate-950">{a.title}</p>
                <p className="mt-1 text-sm text-slate-700">{a.body}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const next = a.status === 'published' ? 'archived' : 'published';
                  await apiFetch(`/api/admin/announcements/${a.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: next }),
                  });
                  const r = await apiFetch('/api/admin/announcements');
                  setAnnouncements(r.announcements);
                }}
                className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 shrink-0"
              >
                {a.status === 'published' ? 'Archive' : 'Republish'}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'placements') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/admin/placements/companies', { method: 'POST', body: JSON.stringify(newComp) });
                notify('Company registered.', 'success');
                setNewComp({ name: '', industry: '', location: '' });
                const r = await apiFetch('/api/admin/placements');
                setPlacements(r);
              } catch (err: any) {
                notify(err.message, 'error');
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
          >
            <h2 className="font-display text-base font-bold text-slate-950">Add Recruiter Company</h2>
            <input
              type="text"
              required
              placeholder="Company Name"
              value={newComp.name}
              onChange={(e) => setNewComp({ ...newComp, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Industry"
                value={newComp.industry}
                onChange={(e) => setNewComp({ ...newComp, industry: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                required
                placeholder="Location"
                value={newComp.location}
                onChange={(e) => setNewComp({ ...newComp, location: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
              Add Company
            </button>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch('/api/admin/placements/drives', { method: 'POST', body: JSON.stringify(newDrive) });
                notify('Placement drive created.', 'success');
                const r = await apiFetch('/api/admin/placements');
                setPlacements(r);
              } catch (err: any) {
                notify(err.message, 'error');
              }
            }}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-3"
          >
            <h2 className="font-display text-base font-bold text-slate-950">Create Placement Drive</h2>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newDrive.companyId}
                onChange={(e) => setNewDrive({ ...newDrive, companyId: Number(e.target.value) })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                {placements.companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                required
                placeholder="Role Title"
                value={newDrive.roleTitle}
                onChange={(e) => setNewDrive({ ...newDrive, roleTitle: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                required
                placeholder="Package (e.g. 12 LPA)"
                value={newDrive.packageLpa}
                onChange={(e) => setNewDrive({ ...newDrive, packageLpa: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              <input
                type="text"
                required
                placeholder="Min CGPA"
                value={newDrive.minCgpa}
                onChange={(e) => setNewDrive({ ...newDrive, minCgpa: e.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
              />
            </div>
            <button type="submit" className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white">
              Publish Drive
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-base font-bold text-slate-950">Student Placement Applications</h2>
          <div className="mt-3 divide-y divide-slate-100 text-xs">
            {placements.applications.map((app: any) => (
              <div key={app.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900">{app.student_name}</span> ({app.college_id} · CGPA {app.cgpa}) —{' '}
                  {app.company_name} ({app.role_title})
                </div>
                <span className="capitalize font-medium text-blue-700">{app.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (section === 'documents') {
    const handleUploadDoc = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!docFile) {
        notify('Select a PDF file first.', 'warning');
        return;
      }
      setUploadingDoc(true);
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('title', docTitle || docFile.name.replace(/\.pdf$/i, ''));
      fd.append('category', docCategory);
      fd.append('accessRole', docAccessRole);
      try {
        const res = await apiFetch('/api/admin/documents/upload', { method: 'POST', body: fd });
        notify(res.message, 'success');
        setDocTitle('');
        setDocFile(null);
        const r = await apiFetch('/api/admin/documents');
        setDocuments(r.documents);
      } catch (err: any) {
        notify(err.message, 'error');
      } finally {
        setUploadingDoc(false);
      }
    };

    return (
      <div className="space-y-6">
        <form onSubmit={handleUploadDoc} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <h1 className="font-display text-lg font-bold text-slate-950">Institutional Document Intelligence (PDF RAG)</h1>
            <p className="mt-1 text-xs text-slate-600">
              Upload official PDF handbooks, examination circulars, or regulations. CampusGPT extracts page-numbered text, chunks it, generates Gemini embeddings, and cites exact pages in AI responses.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              placeholder="Document Title"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="regulations">Academic Regulations</option>
              <option value="circular">Examination Circular</option>
              <option value="calendar">Academic Calendar</option>
              <option value="handbook">Student Handbook</option>
              <option value="placement_policy">Placement Policy</option>
            </select>
            <select
              value={docAccessRole}
              onChange={(e) => setDocAccessRole(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">Access: All Campus Roles</option>
              <option value="student">Students Only</option>
              <option value="teacher">Faculty Only</option>
              <option value="admin">Admins Only</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setDocFile(e.target.files?.[0] || null)}
              className="text-xs text-slate-600"
            />
            <button
              type="submit"
              disabled={uploadingDoc}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              <Upload className="h-4 w-4" />
              {uploadingDoc ? 'Extracting & Embedding...' : 'Upload & Index PDF'}
            </button>
          </div>
        </form>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Document Title</th>
                <th className="px-4 py-3">Category / Access</th>
                <th className="px-4 py-3 text-right">Pages / Chunks</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-900 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-700 shrink-0" />
                      {doc.title}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">{doc.file_name}</div>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-700">
                    {doc.category.replace('_', ' ')} · {doc.access_role}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {doc.page_count}p / {doc.chunk_count} chunks
                  </td>
                  <td className="px-4 py-3 capitalize font-medium">
                    <span
                      className={
                        doc.processing_status === 'ready'
                          ? 'text-emerald-700'
                          : doc.processing_status === 'error'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }
                    >
                      {doc.processing_status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/documents/${doc.id}/archive`, {
                          method: 'PATCH',
                          body: JSON.stringify({ archived: doc.processing_status !== 'archived' }),
                        });
                        const r = await apiFetch('/api/admin/documents');
                        setDocuments(r.documents);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700"
                    >
                      <Archive className="h-3 w-3" />
                      {doc.processing_status === 'archived' ? 'Restore' : 'Archive'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteDocId(doc.id)}
                      aria-label={`Delete ${doc.title}`}
                      className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-[11px] text-red-700"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ConfirmDialog
          open={deleteDocId !== null}
          title="Delete institutional document"
          description="Removing this document deletes its indexed chunks from CampusGPT retrieval."
          confirmLabel="Delete Document"
          destructive
          onConfirm={async () => {
            if (!deleteDocId) return;
            await apiFetch(`/api/admin/documents/${deleteDocId}`, { method: 'DELETE' });
            setDeleteDocId(null);
            notify('Document deleted.', 'info');
            const r = await apiFetch('/api/admin/documents');
            setDocuments(r.documents);
          }}
          onCancel={() => setDeleteDocId(null)}
        />
      </div>
    );
  }

  if (section === 'reports') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="font-display text-xl font-bold text-slate-950">Institutional Attendance Compliance Report</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configured minimum threshold: {reports?.requiredAttendancePct || 75}%
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-5 py-3">Student ID</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Dept / Sem</th>
                <th className="px-4 py-3 text-right">Attended / Total</th>
                <th className="px-5 py-3 text-right">Overall %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(reports?.attendanceReport || []).map((row: any) => (
                <tr key={row.college_id}>
                  <td className="px-5 py-3 font-mono text-xs">{row.college_id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.full_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {row.department_code} · Sem {row.semester}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                    {row.attended} / {row.conducted}
                  </td>
                  <td className={`px-5 py-3 text-right font-mono tabular-nums font-semibold ${row.belowThreshold ? 'text-red-700' : 'text-emerald-700'}`}>
                    {row.percentage}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // AUDIT LOGS
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h1 className="font-display text-lg font-bold text-slate-950">Security &amp; Academic Audit Logs</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Chronological record of authentication, attendance edits, marks updates, fee entries, document indexing, and AI retrievals.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {auditLogs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">{log.created_at}</td>
                <td className="px-4 py-2.5 text-slate-800">{log.actor_email || 'System'}</td>
                <td className="px-4 py-2.5 font-mono font-semibold text-blue-800">{log.action}</td>
                <td className="px-4 py-2.5 font-mono text-slate-600">
                  {log.entity_type}
                  {log.entity_id ? `#${log.entity_id}` : ''}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{log.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
