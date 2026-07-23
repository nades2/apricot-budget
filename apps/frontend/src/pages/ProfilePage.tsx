import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSession } from '../lib/auth';

/**
 * Page /profile — pour l'instant limitée au changement de mot de passe.
 * À étendre plus tard : édition du displayName, préférence de devise/locale,
 * suppression du compte, etc.
 *
 * Le mot de passe actuel est exigé (empêche un token volé de verrouiller le
 * compte). Le nouveau doit faire min 8 caractères et être différent. La
 * session reste valide après changement — pas de logout forcé.
 */
export function ProfilePage() {
  const session = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      api.patch<{ ok: true }>('/auth/password', payload),
    onSuccess: () => {
      setSuccessMsg('Mot de passe changé avec succès.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    },
  });

  // Validations client — dupliquées avec le backend, mais donnent un feedback
  // immédiat sans round-trip.
  const clientError = (() => {
    if (!currentPassword) return null;
    if (!newPassword) return null;
    if (newPassword.length < 8) return 'Le nouveau mot de passe doit contenir au moins 8 caractères.';
    if (newPassword === currentPassword) return 'Le nouveau mot de passe doit être différent de l\'actuel.';
    if (confirm && confirm !== newPassword) return 'La confirmation ne correspond pas.';
    return null;
  })();

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword !== currentPassword &&
    confirm === newPassword &&
    !mutation.isPending;

  const serverError = mutation.error as Error | undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSuccessMsg(null);
    mutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Profil</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Connecté en tant que <b>{session?.user.email}</b>
        </p>
      </header>

      <section className="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Changer le mot de passe
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Minimum 8 caractères. Ta session reste active après le changement.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Mot de passe actuel
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full text-sm rounded px-2.5 py-1.5
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
              required
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Nouveau mot de passe
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              className="w-full text-sm rounded px-2.5 py-1.5
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
              required
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
              Confirmer le nouveau mot de passe
            </span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className="w-full text-sm rounded px-2.5 py-1.5
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
              required
            />
          </label>

          {clientError && (
            <p className="text-xs text-cat-amber-fg dark:text-cat-amber bg-cat-amber-bg dark:bg-cat-amber/15 rounded p-2">
              {clientError}
            </p>
          )}
          {serverError && (
            <p className="text-xs text-cat-red-fg dark:text-cat-red bg-cat-red-bg dark:bg-cat-red/15 rounded p-2">
              {serverError.message}
            </p>
          )}
          {successMsg && (
            <p className="text-xs text-cat-green-fg dark:text-cat-green bg-cat-green-bg dark:bg-cat-green/15 rounded p-2">
              {successMsg}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-1.5 text-sm rounded bg-cat-teal-fg text-white font-medium hover:bg-cat-teal-fg/90 disabled:opacity-50"
            >
              {mutation.isPending ? 'Changement…' : 'Changer le mot de passe'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
