import { useEffect, useState } from 'react';

/**
 * Auth is dead-simple: the JWT + user profile are kept in localStorage under
 * a single key. The api.ts wrapper reads the token to build the
 * `Authorization: Bearer` header, and the App shell redirects to /login if
 * no session exists (or if the server returns 401).
 *
 * For a LAN family app this is adequate; for public deployment we'd want
 * httpOnly cookies + CSRF.
 */
const KEY = 'apricot.session';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type Session = {
  token: string;
  user: SessionUser;
};

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setSession(s: Session) {
  window.localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new Event('apricot.session-changed'));
}

export function clearSession() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('apricot.session-changed'));
}

/** React hook that re-renders when the session changes (login/logout). */
export function useSession(): Session | null {
  const [session, setSessionState] = useState<Session | null>(getSession);
  useEffect(() => {
    const refresh = () => setSessionState(getSession());
    window.addEventListener('apricot.session-changed', refresh);
    window.addEventListener('storage', refresh); // cross-tab
    return () => {
      window.removeEventListener('apricot.session-changed', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return session;
}
