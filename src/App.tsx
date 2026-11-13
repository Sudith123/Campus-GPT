import React, { useEffect, useState } from 'react';
import { apiFetch, setSessionToken, setUnauthorizedHandler } from './lib/api';
import { AuthUser, PlatformMeta } from './types/campus';
import { ToastProvider } from './components/ToastProvider';
import { LandingPage } from './components/LandingPage';
import { AuthView } from './components/AuthView';
import { AppShell } from './components/AppShell';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [meta, setMeta] = useState<PlatformMeta | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<'landing' | 'auth'>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('autostart=1')) {
      return 'auth';
    }
    return 'landing';
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setView('auth');
    });
    apiFetch<{ user: AuthUser | null; meta: PlatformMeta }>('/api/auth/me')
      .then((res) => {
        if (!res.user) {
          setSessionToken(null);
        }
        setUser(res.user);
        setMeta(res.meta);
      })
      .catch(() => {})
      .finally(() => setBooting(false));

    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <ToastProvider>
      {booting ? (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="font-display text-lg font-bold text-slate-950">CampusGPT</p>
            <p className="text-xs text-slate-500">Loading academic intelligence platform...</p>
          </div>
        </div>
      ) : user ? (
        <AppShell
          user={user}
          onUserUpdated={(u) => setUser(u)}
          onLoggedOut={() => {
            setUser(null);
            setView('landing');
          }}
        />
      ) : view === 'auth' ? (
        <AuthView
          initialMode={authMode}
          meta={meta}
          onAuthenticated={(u) => setUser(u)}
          onBackToLanding={() => setView('landing')}
        />
      ) : (
        <LandingPage
          onGetStarted={() => {
            setAuthMode('login');
            setView('auth');
          }}
          onSignInRole={(mode) => {
            setAuthMode(mode);
            setView('auth');
          }}
        />
      )}
    </ToastProvider>
  );
}
