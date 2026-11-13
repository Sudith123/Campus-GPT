import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Database,
  FileText,
  Globe,
  GraduationCap,
  Lock,
  MessageSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignInRole?: (mode: 'login' | 'register') => void;
}

export function LandingPage({ onGetStarted, onSignInRole }: LandingPageProps) {
  const [activeBenefitTab, setActiveBenefitTab] = useState<'student' | 'teacher' | 'admin'>('student');
  const [previewLang, setPreviewLang] = useState<'English' | 'Kannada' | 'Hindi'>('English');

  const previewTranslations: Record<'English' | 'Kannada' | 'Hindi', { q: string; a: string; source: string }> = {
    English: {
      q: 'How many CS502 classes must I attend to reach the 75% requirement?',
      a: 'Your verified attendance in Database Management Systems (CS502) is 19 of 28 classes (67.86%). Based on the 75% institutional rule, you must attend 8 consecutive upcoming classes without absence to recover to 75.00%.',
      source: 'Verified Attendance Ledger · Academic & Attendance Regulations 2026-27 (Page 1)',
    },
    Kannada: {
      q: '75% ಹಾಜರಾತಿ ತಲುಪಲು CS502 ತರಗತಿಗಳಿಗೆ ನಾನು ಇನ್ನೂ ಎಷ್ಟು ಹಾಜರಾಗಬೇಕು?',
      a: 'Database Management Systems (CS502) ವಿಷಯದಲ್ಲಿ ನಿಮ್ಮ ಹಾಜರಾತಿ 19/28 (67.86%) ಆಗಿದೆ. 75% ನಿಯಮವನ್ನು ತಲುಪಲು ನೀವು ಮುಂದಿನ 8 ತರಗತಿಗಳಿಗೆ ನಿರಂತರವಾಗಿ ಹಾಜರಾಗಬೇಕು.',
      source: 'Verified Attendance Ledger · Academic & Attendance Regulations 2026-27 (Page 1)',
    },
    Hindi: {
      q: '75% उपस्थिति पूरी करने के लिए मुझे CS502 की कितनी कक्षाएं और लगानी होंगी?',
      a: 'Database Management Systems (CS502) में आपकी सत्यापित उपस्थिति 19/28 (67.86%) है। 75% नियम के अनुसार, आपको लगातार अगली 8 कक्षाओं में उपस्थित रहना होगा।',
      source: 'Verified Attendance Ledger · Academic & Attendance Regulations 2026-27 (Page 1)',
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* 1. NAVIGATION BAR — Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <a href="#top" className="font-display text-lg font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0">
            CampusGPT
          </a>

          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#architecture" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
              Platform
            </a>
            <a href="#roles" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
              Experiences
            </a>
            <a href="#ai-engine" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
              Intelligence
            </a>
            <a href="#security" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
              Security
            </a>
            <a href="#multilingual" className="hover:text-slate-950 transition-colors whitespace-nowrap shrink-0">
              Languages
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onGetStarted}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* 2. HERO SECTION */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:py-24">
            <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-6">
                <p className="text-xs font-medium tracking-wide text-blue-700">
                  One College · One Platform · Every Answer
                </p>
                <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl lg:leading-[1.1] text-balance">
                  Your Entire College, Powered by Intelligence.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600">
                  Meet CampusGPT — one intelligent platform connecting academic records, college information, student services and powerful AI assistance.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={onGetStarted}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <a
                    href="#architecture"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    Explore Features
                  </a>
                </div>
                <p className="mt-6 text-xs text-slate-500">
                  Independent academic software platform · Includes demonstration dataset for Meridian Institute of Technology
                </p>
              </div>

              {/* Product Dashboard Preview + Architectural Backdrop */}
              <div className="lg:col-span-6">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-lg">
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src="/src/assets/images/hero_campus_architecture_1794542566292.jpg"
                      alt="Modern university library atrium with natural light"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover opacity-80"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />
                    <div className="absolute bottom-3 left-5 right-5 flex items-center justify-between text-xs text-slate-200">
                      <span className="font-medium">Meridian Institute Demo Workspace</span>
                      <span className="font-mono tabular-nums text-sky-300">Semester 5 · 2026-27</span>
                    </div>
                  </div>
                  <div className="p-5 bg-slate-950 text-slate-100">
                    <div className="grid grid-cols-3 gap-3 border-b border-slate-800 pb-4">
                      <div>
                        <p className="text-xs text-slate-400">Overall Attendance</p>
                        <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">80.88%</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Exam Average</p>
                        <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-white">85.40%</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Eligible Drives</p>
                        <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-sky-400">2 Open</p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
                      <p className="text-xs font-medium text-sky-400">Unified CampusGPT Assistant</p>
                      <p className="mt-1.5 text-sm text-slate-200">
                        “CS502 attendance is 67.86% (19/28). Attend the next 8 consecutive classes to meet the 75% policy threshold.”
                      </p>
                      <p className="mt-2 text-xs text-slate-400">
                        Sources: Attendance Ledger · Academic Regulations 2026-27 (Page 1)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. PRODUCT INTRODUCTION — THREE INTELLIGENCE SYSTEMS */}
        <section id="architecture" className="mx-auto max-w-7xl px-6 py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950 text-balance">
              Three intelligence layers working as one unified system
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed">
              CampusGPT separates general AI reasoning, verified database records, and institutional PDF policies—routing every question to the exact source required without fabricating academic numbers.
            </p>
          </div>

          {/* 4. MAIN CAPABILITIES — Asymmetric Bento Layout */}
          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-7">
              <div className="flex items-center gap-3 text-blue-700">
                <MessageSquare className="h-5 w-5" />
                <span className="text-xs font-semibold tracking-wide">01. General AI Intelligence</span>
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold text-slate-950">
                Always useful for study, coding, and math
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Ask programming questions, debug algorithms, solve mathematics problems, prepare for technical interviews, or summarize study notes inside the same assistant.
              </p>
              <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
                Code Explanation · Reasoning · Study Plans · Interview Prep
              </div>
            </div>

            <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-7">
              <div className="flex items-center gap-3 text-blue-700">
                <Database className="h-5 w-5" />
                <span className="text-xs font-semibold tracking-wide">02. Personal &amp; Academic College Intelligence</span>
              </div>
              <h3 className="mt-4 font-display text-xl font-semibold text-slate-950">
                Deterministic calculations over authenticated ERP records
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Every student, teacher, and administrator queries only records they are authorized to access. Attendance recovery counts, mark averages, timetable conflicts, and placement eligibility are computed by backend math—never guessed by an LLM.
              </p>
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 pt-4 text-xs text-slate-600">
                <div>Attendance Predictor</div>
                <div>Marks &amp; Grades</div>
                <div>Timetable &amp; Fees</div>
                <div>Placement Checks</div>
              </div>
            </div>

            <div className="lg:col-span-12 rounded-xl border border-slate-200 bg-white p-7">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
                <div className="lg:col-span-7">
                  <div className="flex items-center gap-3 text-blue-700">
                    <FileText className="h-5 w-5" />
                    <span className="text-xs font-semibold tracking-wide">03. Institutional Document Intelligence (RAG)</span>
                  </div>
                  <h3 className="mt-4 font-display text-xl font-semibold text-slate-950">
                    Verified answers grounded in official college PDFs with page citations
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Administrators upload handbooks, examination circulars, academic calendars, and placement guidelines. CampusGPT extracts page-numbered text, creates vector embeddings, enforces role permissions, and cites exact pages in every policy response.
                  </p>
                </div>
                <div className="lg:col-span-5 overflow-hidden rounded-lg border border-slate-200">
                  <img
                    src="/src/assets/images/academic_handbook_desk_1794542565518.jpg"
                    alt="Academic handbooks and reference binders on a studio desk"
                    referrerPolicy="no-referrer"
                    className="h-48 w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5, 6, 7. ROLE-BASED BENEFITS — STUDENT, TEACHER, ADMIN */}
        <section id="roles" className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-xl">
                <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950">
                  Built separately for every campus role
                </h2>
                <p className="mt-2 text-base text-slate-600">
                  Three distinct authenticated portals enforcing strict backend role boundaries.
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 self-start">
                {(['student', 'teacher', 'admin'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setActiveBenefitTab(role)}
                    className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                      activeBenefitTab === role
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-600 hover:text-slate-950'
                    }`}
                  >
                    {role === 'admin' ? 'Administration' : `${role}s`}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {activeBenefitTab === 'student' && (
                <>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <GraduationCap className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">Attendance &amp; Predictor</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Track subject-wise attendance and compute exactly how many classes you can miss—or must attend—against the configured policy.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <BookOpen className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">Marks, Assignments &amp; Reports</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Inspect internal assessments, performance trends, active assignments, and download CSV academic reports.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <Calendar className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">Timetable, Fees &amp; Placements</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      View daily schedules, read-only fee invoices, and placement drives with automated CGPA &amp; backlog eligibility checks.
                    </p>
                  </div>
                </>
              )}

              {activeBenefitTab === 'teacher' && (
                <>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <Users className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">Authorized Class Rosters</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      View and search only students enrolled in your assigned subjects and sections with real-time attendance status.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <CheckCircle2 className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">Attendance &amp; Marks Entry</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Mark attendance sessions, validate exam marks against maximum thresholds, and review assignment submissions.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <MessageSquare className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">Faculty AI Insights</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Ask CampusGPT to identify students below threshold or summarize performance bottlenecks in your assigned subjects.
                    </p>
                  </div>
                </>
              )}

              {activeBenefitTab === 'admin' && (
                <>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <Database className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">Institutional ERP Control</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Manage students, faculty, authorized registration rosters, departments, fee invoices, announcements, and conflict-checked timetables.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <FileText className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">PDF Document Intelligence</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Upload approved PDF circulars and handbooks, track page extraction and embedding status, and set role access permissions.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-6">
                    <ShieldCheck className="h-5 w-5 text-blue-700" />
                    <h3 className="mt-4 font-display text-lg font-semibold text-slate-950">Reports &amp; Audit Trail</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      Audit marks edits, attendance modifications, fee records, document uploads, and sensitive AI queries in one chronological log.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* 8 & 9. AI CAPABILITIES + SECURITY & PRIVACY */}
        <section id="ai-engine" className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-950">
                Grounded AI orchestration that never guesses academic facts
              </h2>
              <p className="mt-4 text-base text-slate-600 leading-relaxed">
                The server-side AI router classifies every query into general reasoning, personal database lookup, faculty/admin analytics, institutional documents, or mixed queries—combining deterministic math with Gemini tool calling.
              </p>
              <dl className="mt-8 space-y-4 border-t border-slate-200 pt-6">
                <div>
                  <dt className="text-sm font-semibold text-slate-950">Source Transparency</dt>
                  <dd className="mt-1 text-sm text-slate-600">
                    Every response clearly distinguishes verified database rows, cited PDF pages, and general AI explanations.
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-slate-950">Prompt Injection Defense</dt>
                  <dd className="mt-1 text-sm text-slate-600">
                    Uploaded PDFs are isolated as untrusted reference text so document content cannot override system authorization rules.
                  </dd>
                </div>
              </dl>
            </div>

            <div id="security" className="rounded-xl border border-slate-200 bg-slate-950 p-8 text-slate-100">
              <div className="flex items-center gap-3 text-sky-400">
                <Lock className="h-5 w-5" />
                <span className="text-xs font-semibold tracking-wide">Security &amp; Privacy Architecture</span>
              </div>
              <h3 className="mt-4 font-display text-2xl font-bold text-white">
                Server-side enforcement from database to model
              </h3>
              <ul className="mt-6 space-y-3.5 text-sm text-slate-300">
                <li className="flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-sky-400 shrink-0" />
                  <span>Roster-verified registration with bcrypt password hashing and HttpOnly session cookies.</span>
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-sky-400 shrink-0" />
                  <span>All Gemini API keys remain strictly server-side; zero keys or sensitive tables exposed to browser JS.</span>
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-sky-400 shrink-0" />
                  <span>Parameterized SQLite queries, file-signature PDF validation, and login/AI rate limiting.</span>
                </li>
                <li className="flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 mt-0.5 text-sky-400 shrink-0" />
                  <span>Cryptographic 6-digit OTP support (hashed, 5-minute expiry, single-use) when SMTP is configured.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* 10. MULTILINGUAL SUPPORT */}
        <section id="multilingual" className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5">
                <div className="flex items-center gap-2 text-blue-700">
                  <Globe className="h-5 w-5" />
                  <span className="text-xs font-semibold tracking-wide">Multilingual Academic AI</span>
                </div>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-950">
                  Ask in English, Kannada, or Hindi
                </h2>
                <p className="mt-3 text-base text-slate-600 leading-relaxed">
                  CampusGPT understands mixed-language questions and responds fluently in your chosen language while preserving exact numbers, subject codes, and official document titles.
                </p>
                <div className="mt-6 flex items-center gap-2">
                  {(['English', 'Kannada', 'Hindi'] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setPreviewLang(lang)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                        previewLang === lang
                          ? 'border-blue-700 bg-blue-700 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {lang === 'Kannada' ? 'ಕನ್ನಡ (Kannada)' : lang === 'Hindi' ? 'हिन्दी (Hindi)' : 'English'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-xs font-medium text-slate-500">Student Prompt · {previewLang}</p>
                <p className="mt-2 rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-900">
                  {previewTranslations[previewLang].q}
                </p>
                <p className="mt-4 text-xs font-medium text-blue-700">CampusGPT Grounded Response</p>
                <p className="mt-2 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 leading-relaxed">
                  {previewTranslations[previewLang].a}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  Sources: {previewTranslations[previewLang].source}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 11. CALL TO ACTION */}
        <section className="bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-6 py-16 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Ready to explore the CampusGPT ecosystem?
              </h2>
              <p className="mt-2 text-sm text-slate-300">
                Sign in with demonstration Student, Teacher, or Registrar credentials or register via the approved institutional roster.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => (onSignInRole ? onSignInRole('register') : onGetStarted())}
                className="rounded-lg border border-slate-700 bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Register Account
              </button>
              <button
                type="button"
                onClick={onGetStarted}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 whitespace-nowrap shrink-0"
              >
                Launch Portal
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* 12. FOOTER */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500">
          <div>
            <span className="font-display font-semibold text-slate-900">CampusGPT</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>Not officially affiliated with any external university or college. Academic records shown in the demo belong to the fictional Meridian Institute of Technology dataset.</span>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <a href="#architecture" className="hover:text-slate-900">Architecture</a>
            <a href="#security" className="hover:text-slate-900">Security</a>
            <button type="button" onClick={onGetStarted} className="font-medium text-blue-700 hover:underline">
              Sign In
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
