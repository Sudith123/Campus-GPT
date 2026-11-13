import React, { useEffect, useState } from 'react';
import { ArrowLeft, Info, KeyRound, MailCheck, Shield } from 'lucide-react';
import { apiFetch, setSessionToken } from '../lib/api';
import { AuthUser, PlatformMeta } from '../types/campus';
import { useToast } from './ToastProvider';

interface AuthViewProps {
  initialMode?: 'login' | 'register';
  meta: PlatformMeta | null;
  onAuthenticated: (user: AuthUser) => void;
  onBackToLanding: () => void;
}

export function AuthView({
  initialMode = 'login',
  meta,
  onAuthenticated,
  onBackToLanding,
}: AuthViewProps) {
  const { notify } = useToast();
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'forgot'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Array<{ id: number; code: string; name: string }>>([]);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [fullName, setFullName] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [departmentId, setDepartmentId] = useState<number>(1);
  const [semester, setSemester] = useState<number>(5);
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OTP / Reset state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otpSentMessage, setOtpSentMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ departments: Array<{ id: number; code: string; name: string }> }>('/api/auth/departments')
      .then((d) => {
        setDepartments(d.departments);
        if (d.departments[0]) setDepartmentId(d.departments[0].id);
      })
      .catch(() => {});
  }, []);

  const fillDemo = (email: string) => {
    setMode('login');
    setLoginEmail(email);
    setLoginPassword('DemoPass@2026');
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ user: AuthUser; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (data.token) setSessionToken(data.token);
      notify(`Signed in as ${data.user.fullName}`, 'success');
      onAuthenticated(data.user);
    } catch (err: any) {
      if (err?.data?.requiresVerification) {
        setOtpEmail(err.data.email || loginEmail);
        setMode('verify');
      }
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{
        user?: AuthUser;
        token?: string;
        requiresVerification: boolean;
        email?: string;
        message: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          collegeId,
          email: regEmail,
          departmentId,
          semester,
          password: regPassword,
          confirmPassword,
        }),
      });
      notify(data.message, 'success');
      if (data.requiresVerification) {
        setOtpEmail(data.email || regEmail);
        setMode('verify');
      } else if (data.user) {
        if (data.token) setSessionToken(data.token);
        onAuthenticated(data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async (purpose: 'email_verification' | 'password_reset') => {
    setError(null);
    setOtpSentMessage(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ email: otpEmail, purpose }),
      });
      setOtpSentMessage(data.message);
      notify(data.message, 'info');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent, purpose: 'email_verification' | 'password_reset') => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: otpEmail,
          otp: otpCode,
          purpose,
          newPassword: purpose === 'password_reset' ? newPassword : undefined,
        }),
      });
      notify(data.message, 'success');
      setMode('login');
      setLoginEmail(otpEmail);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button
            type="button"
            onClick={onBackToLanding}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to CampusGPT
          </button>
          <span className="font-display text-lg font-bold tracking-tight text-slate-950">CampusGPT</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-12 lg:items-start">
        {/* Left Auth Card */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h1 className="font-display text-2xl font-bold text-slate-950">
                {mode === 'login' && 'Sign in to your campus account'}
                {mode === 'register' && 'Roster-verified registration'}
                {mode === 'verify' && 'Verify college email via OTP'}
                {mode === 'forgot' && 'Reset account password'}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {meta?.institutionName || 'Meridian Institute of Technology (Demo Institution)'}
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  mode === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                  mode === 'register' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-slate-800">
                  College Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="name@meridian.edu.in"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-800">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpEmail(loginEmail);
                      setMode('forgot');
                      setError(null);
                    }}
                    className="text-xs font-medium text-blue-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="mt-6 space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                Registration requires a matching entry on the approved institutional roster. Example pre-approved roster entry for testing: <span className="font-mono">rohan.k@meridian.edu.in</span> · ID <span className="font-mono">1MIT24CS019</span> (CSE, Sem 5).
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-medium text-slate-800">
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Rohan Kulkarni"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="reg-cid" className="block text-sm font-medium text-slate-800">
                    Student or Employee ID
                  </label>
                  <input
                    id="reg-cid"
                    type="text"
                    required
                    value={collegeId}
                    onChange={(e) => setCollegeId(e.target.value)}
                    placeholder="1MIT24CS019"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-sm font-medium text-slate-800">
                  College Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="rohan.k@meridian.edu.in"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="reg-dept" className="block text-sm font-medium text-slate-800">
                    Department
                  </label>
                  <select
                    id="reg-dept"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-sem" className="block text-sm font-medium text-slate-800">
                    Semester (Students)
                  </label>
                  <select
                    id="reg-sem"
                    value={semester}
                    onChange={(e) => setSemester(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>
                        Semester {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="reg-pass" className="block text-sm font-medium text-slate-800">
                    Password (min 8 chars)
                  </label>
                  <input
                    id="reg-pass"
                    type="password"
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="reg-confirm" className="block text-sm font-medium text-slate-800">
                    Confirm Password
                  </label>
                  <input
                    id="reg-confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {loading ? 'Verifying roster...' : 'Create Roster-Verified Account'}
              </button>
            </form>
          )}

          {(mode === 'verify' || mode === 'forgot') && (
            <form
              onSubmit={(e) => handleVerifyOtp(e, mode === 'verify' ? 'email_verification' : 'password_reset')}
              className="mt-6 space-y-4"
            >
              {!meta?.smtpConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-relaxed">
                  <p className="font-semibold">Email Provider Not Configured (SMTP)</p>
                  <p className="mt-1">
                    SMTP_HOST, SMTP_USER, and SMTP_PASS are not set in this environment. CampusGPT refuses to fake OTP delivery. Configure an SMTP provider (e.g., Amazon SES, Postmark, or institutional relay) in environment variables to enable live 6-digit OTP emails.
                  </p>
                </div>
              )}

              {otpSentMessage && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
                  {otpSentMessage}
                </div>
              )}

              <div>
                <label htmlFor="otp-email" className="block text-sm font-medium text-slate-800">
                  College Email
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="otp-email"
                    type="email"
                    required
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
                  />
                  <button
                    type="button"
                    disabled={loading || !otpEmail}
                    onClick={() => handleRequestOtp(mode === 'verify' ? 'email_verification' : 'password_reset')}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Send 6-Digit OTP
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="otp-code" className="block text-sm font-medium text-slate-800">
                  6-Digit OTP Code
                </label>
                <input
                  id="otp-code"
                  type="text"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="123456"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono tracking-widest"
                />
              </div>

              {mode === 'forgot' && (
                <div>
                  <label htmlFor="new-pass" className="block text-sm font-medium text-slate-800">
                    New Password
                  </label>
                  <input
                    id="new-pass"
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Return to Sign In
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {mode === 'verify' ? 'Verify Email' : 'Reset Password'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Right Column: Demonstration Accounts & Security Notice */}
        <aside className="lg:col-span-5 space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2 text-blue-700">
              <KeyRound className="h-4 w-4" />
              <h2 className="text-sm font-semibold text-slate-950">Fictional Demonstration Accounts</h2>
            </div>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Explore each role-isolated portal using these seeded demo accounts (Password: <span className="font-mono font-medium text-slate-900">DemoPass@2026</span>).
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => fillDemo('aarav.sharma@meridian.edu.in')}
                className="w-full rounded-lg border border-slate-200 p-3.5 text-left hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Student Portal — Aarav Sharma</span>
                  <span className="text-xs font-medium text-blue-700">Fill credentials</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono">aarav.sharma@meridian.edu.in · 1MIT24CS001 (CSE Sem 5)</p>
              </button>

              <button
                type="button"
                onClick={() => fillDemo('prof.kavita@meridian.edu.in')}
                className="w-full rounded-lg border border-slate-200 p-3.5 text-left hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Teacher Portal — Prof. Kavita Deshmukh</span>
                  <span className="text-xs font-medium text-blue-700">Fill credentials</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono">prof.kavita@meridian.edu.in · FAC-CSE-04 (OS, DBMS, ML)</p>
              </button>

              <button
                type="button"
                onClick={() => fillDemo('admin.registrar@meridian.edu.in')}
                className="w-full rounded-lg border border-slate-200 p-3.5 text-left hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Admin Portal — Dr. Nandini Iyer</span>
                  <span className="text-xs font-medium text-blue-700">Fill credentials</span>
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono">admin.registrar@meridian.edu.in · ADM-REG-01</p>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 text-xs text-slate-600 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <Shield className="h-4 w-4 text-blue-700" />
              <span>Security &amp; Email Configuration</span>
            </div>
            <p className="leading-relaxed">
              Sessions use HttpOnly signed cookies with 24-hour expiration, bcrypt password hashing, and sliding-window rate limits.
            </p>
            <div className="flex items-center gap-2 pt-1 text-slate-700">
              <MailCheck className="h-4 w-4 text-slate-500 shrink-0" />
              <span>
                SMTP OTP Status:{' '}
                <strong className="font-medium">
                  {meta?.smtpConfigured ? 'Configured & Active' : 'Unconfigured (see .env.example)'}
                </strong>
              </span>
            </div>
            <div className="flex items-start gap-2 pt-1 text-slate-500">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Unapproved emails outside the institutional roster are rejected during registration.</span>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
