import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardList,
  FileText,
  Globe,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Receipt,
  ShieldAlert,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';
import { apiFetch, setSessionToken } from '../lib/api';
import { AuthUser, SupportedLanguage } from '../types/campus';
import { StudentDashboard, StudentSection } from './StudentDashboard';
import { TeacherDashboard, TeacherSection } from './TeacherDashboard';
import { AdminDashboard, AdminSection } from './AdminDashboard';
import { CampusAIChat } from './CampusAIChat';
import { useToast } from './ToastProvider';

interface AppShellProps {
  user: AuthUser;
  onUserUpdated: (u: AuthUser) => void;
  onLoggedOut: () => void;
}

export function AppShell({ user, onUserUpdated, onLoggedOut }: AppShellProps) {
  const { notify } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>('overview');

  const studentNav: Array<{ id: StudentSection | 'ai'; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'ai', label: 'CampusGPT AI', icon: Sparkles },
    { id: 'attendance', label: 'Attendance', icon: CheckSquare },
    { id: 'academics', label: 'Marks & Results', icon: BarChart3 },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'assignments', label: 'Assignments', icon: ClipboardList },
    { id: 'fees', label: 'Fees (Read-Only)', icon: Receipt },
    { id: 'placements', label: 'Placements', icon: Briefcase },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'profile', label: 'Profile & Settings', icon: User },
  ];

  const teacherNav: Array<{ id: TeacherSection | 'ai'; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'ai', label: 'CampusGPT AI', icon: Sparkles },
    { id: 'students', label: 'Class Students', icon: Users },
    { id: 'attendance', label: 'Mark Attendance', icon: CheckSquare },
    { id: 'marks', label: 'Marks Entry', icon: BarChart3 },
    { id: 'assignments', label: 'Assignments', icon: ClipboardList },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
  ];

  const adminNav: Array<{ id: AdminSection | 'ai'; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'ai', label: 'CampusGPT AI', icon: Sparkles },
    { id: 'documents', label: 'Document RAG', icon: FileText },
    { id: 'students', label: 'Students', icon: GraduationCap },
    { id: 'teachers', label: 'Faculty', icon: Users },
    { id: 'academics', label: 'Academics & Roster', icon: BookOpen },
    { id: 'timetable', label: 'Timetable', icon: Calendar },
    { id: 'fees', label: 'Fees Ledger', icon: Receipt },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'placements', label: 'Placements', icon: Briefcase },
    { id: 'reports', label: 'Reports', icon: Building2 },
    { id: 'audit', label: 'Audit Logs', icon: ShieldAlert },
  ];

  const navItems =
    user.roleName === 'student' ? studentNav : user.roleName === 'teacher' ? teacherNav : adminNav;

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({ preferredLanguage: lang }),
      });
      onUserUpdated(res.user);
      notify(`Language switched to ${lang}.`, 'info');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleOpenAIWithPrompt = (prompt: string) => {
    setAiInitialPrompt(prompt);
    setActiveTab('ai');
    setAiDrawerOpen(false);
  };

  const handleToggleNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && user.roleName === 'student') {
      try {
        const res = await apiFetch('/api/student/dashboard');
        setNotifications(res.notifications || []);
      } catch {
        setNotifications([]);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local session state regardless of network outcome
    } finally {
      setSessionToken(null);
      onLoggedOut();
    }
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-slate-950 text-slate-200">
      <div className="border-b border-slate-800 px-5 py-4 flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight text-white">CampusGPT</span>
        <span className="text-[11px] font-mono text-sky-400 uppercase">{user.roleName}</span>
      </div>

      <nav aria-label="Workspace navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                active ? 'bg-blue-700 text-white' : 'text-slate-300 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4 space-y-3">
        <div className="text-xs">
          <p className="font-semibold text-white truncate">{user.fullName}</p>
          <p className="font-mono text-[11px] text-slate-400 truncate">{user.collegeId}</p>
          {user.isDemo && <p className="mt-1 text-[10px] text-sky-400">Demonstration Institution Data</p>}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-200">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative z-10 w-64 max-w-[80vw] h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-700"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-900 capitalize">{user.roleName} Portal</span>
              <span className="mx-2">/</span>
              <span className="capitalize">{navItems.find((i) => i.id === activeTab)?.label || activeTab}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <Globe className="h-3.5 w-3.5 text-slate-500" />
              <label htmlFor="header-lang" className="sr-only">
                Language
              </label>
              <select
                id="header-lang"
                value={user.preferredLanguage}
                onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
                className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
              >
                <option value="English">English</option>
                <option value="Kannada">ಕನ್ನಡ</option>
                <option value="Hindi">हिन्दी</option>
              </select>
            </div>

            {user.roleName === 'student' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={handleToggleNotifications}
                  aria-label="Toggle notifications"
                  className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
                >
                  <Bell className="h-4 w-4" />
                </button>
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl z-40">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-semibold text-slate-950">Smart Alerts</span>
                      <span className="text-[10px] text-slate-500">Generated on open</span>
                    </div>
                    <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <p className="py-4 text-center text-xs text-slate-500">No active alerts.</p>
                      ) : (
                        notifications.map((n) => (
                          <div key={n.id} className="py-2.5 text-xs">
                            <p className="font-semibold text-slate-900">{n.title}</p>
                            <p className="mt-0.5 text-slate-600">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {activeTab === 'ai' ? (
            <CampusAIChat
              user={user}
              language={user.preferredLanguage}
              onLanguageChange={handleLanguageChange}
              initialPrompt={aiInitialPrompt}
              onConsumeInitialPrompt={() => setAiInitialPrompt(null)}
            />
          ) : user.roleName === 'student' ? (
            <StudentDashboard
              user={user}
              section={activeTab as StudentSection}
              onNavigate={(sec) => setActiveTab(sec)}
              onOpenAIWithPrompt={handleOpenAIWithPrompt}
              onUserUpdated={onUserUpdated}
            />
          ) : user.roleName === 'teacher' ? (
            <TeacherDashboard
              user={user}
              section={activeTab as TeacherSection}
              onNavigate={(sec) => setActiveTab(sec)}
              onOpenAIWithPrompt={handleOpenAIWithPrompt}
            />
          ) : (
            <AdminDashboard
              user={user}
              section={activeTab as AdminSection}
              onOpenAIWithPrompt={handleOpenAIWithPrompt}
            />
          )}
        </main>
      </div>

      {/* Floating CampusGPT AI Button (when not already in full-screen AI tab) */}
      {activeTab !== 'ai' && (
        <button
          type="button"
          onClick={() => setAiDrawerOpen(true)}
          aria-label="Open CampusGPT floating assistant"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-3 text-xs font-semibold text-white shadow-lg hover:bg-blue-800 transition-colors"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Ask CampusGPT</span>
        </button>
      )}

      {/* Floating AI Drawer */}
      {aiDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="CampusGPT Assistant Drawer"
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
        >
          <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="font-display text-sm font-bold text-slate-950">CampusGPT Quick Assistant</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAiDrawerOpen(false);
                    setActiveTab('ai');
                  }}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Expand Full View
                </button>
                <button
                  type="button"
                  onClick={() => setAiDrawerOpen(false)}
                  aria-label="Close AI drawer"
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-3">
              <CampusAIChat
                user={user}
                language={user.preferredLanguage}
                onLanguageChange={handleLanguageChange}
                compact
                initialPrompt={aiInitialPrompt}
                onConsumeInitialPrompt={() => setAiInitialPrompt(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
