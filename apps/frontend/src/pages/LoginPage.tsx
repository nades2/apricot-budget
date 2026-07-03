import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setSession, Session } from '../lib/auth';

export function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('demo@apricot.local');
  const [password, setPassword] = useState('demo1234');

  const login = useMutation({
    mutationFn: () => api.post<Session>('/auth/login', { email, password }),
    onSuccess: (s) => {
      setSession(s);
      nav('/calendar', { replace: true });
    },
  });

  return (
    <AuthShell title="Connexion" subtitle="Accède à ton budget apricot">
      <form
        onSubmit={(e) => { e.preventDefault(); login.mutate(); }}
        className="space-y-3"
      >
        <Field label="Courriel">
          <input
            type="email" autoFocus required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Mot de passe">
          <input
            type="password" required minLength={6} value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm"
          />
        </Field>

        {login.error && (
          <p className="text-sm text-cat-red-fg bg-cat-red-bg dark:bg-cat-red-fg/20 rounded-md px-3 py-2">
            {(login.error as Error).message}
          </p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full py-2 rounded-md bg-brand-300 hover:bg-brand-400 text-brand-800 font-medium text-sm disabled:opacity-50"
        >
          {login.isPending ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
        Pas encore de compte ? <Link to="/register" className="text-brand-400 hover:underline">Créer un compte</Link>
      </p>
      <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500 text-center">
        Démo : demo@apricot.local / demo1234
      </p>
    </AuthShell>
  );
}

// ------------------------------------------------------------------------
// Shared for login + register
// ------------------------------------------------------------------------

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🍑</div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 dark:text-gray-400 font-medium block mb-1">{label}</span>
      {children}
    </label>
  );
}
