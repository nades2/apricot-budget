import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { setSession, Session } from '../lib/auth';
import { AuthShell, Field } from './LoginPage';

export function RegisterPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const register = useMutation({
    mutationFn: () =>
      api.post<Session>('/auth/register', {
        email,
        password,
        displayName: displayName || undefined,
        inviteCode: inviteCode || undefined,
      }),
    onSuccess: (s) => {
      setSession(s);
      nav('/calendar', { replace: true });
    },
  });

  return (
    <AuthShell title="Créer un compte" subtitle="Bienvenue sur apricot-budget">
      <form
        onSubmit={(e) => { e.preventDefault(); register.mutate(); }}
        className="space-y-3"
      >
        <Field label="Code d'invitation">
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Requis pour créer un compte"
            required
            autoFocus
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Nom (optionnel)">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Courriel">
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Mot de passe (min. 8)">
          <input
            type="password" required minLength={8} value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-md px-3 py-2 text-sm"
          />
        </Field>

        {register.error && (
          <p className="text-sm text-cat-red-fg dark:text-cat-red bg-cat-red-bg dark:bg-cat-red/15 rounded-md px-3 py-2">
            {(register.error as Error).message}
          </p>
        )}

        <button
          type="submit"
          disabled={register.isPending}
          className="w-full py-2 rounded-md bg-brand-300 hover:bg-brand-400 text-brand-800 font-medium text-sm disabled:opacity-50"
        >
          {register.isPending ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
        Déjà un compte ? <Link to="/login" className="text-brand-400 hover:underline">Se connecter</Link>
      </p>
    </AuthShell>
  );
}
