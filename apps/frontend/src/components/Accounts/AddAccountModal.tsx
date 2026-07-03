import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, Account } from '../../lib/api';

/**
 * Unified form used both for create ("Ajouter") and edit ("Modifier"). When
 * `account` is provided, the modal enters edit mode: fields prefill, submit
 * PATCHes, and a delete button appears.
 */
const SUBTYPES: Record<'ASSET' | 'LIABILITY', { value: string; label: string }[]> = {
  ASSET: [
    { value: 'CHECKING', label: 'Compte chèque' },
    { value: 'SAVINGS', label: 'Épargne' },
    { value: 'INVESTMENT', label: 'Placement / REER' },
    { value: 'REAL_ESTATE', label: 'Immobilier' },
    { value: 'VEHICLE', label: 'Véhicule' },
    { value: 'OTHER_ASSET', label: 'Autre actif' },
  ],
  LIABILITY: [
    { value: 'CREDIT_CARD', label: 'Carte de crédit' },
    { value: 'MORTGAGE', label: 'Hypothèque' },
    { value: 'LOAN', label: 'Prêt' },
    { value: 'LINE_OF_CREDIT', label: 'Marge de crédit' },
    { value: 'OTHER_LIABILITY', label: 'Autre passif' },
  ],
};

type AccountLite = Pick<Account, 'id' | 'name' | 'type' | 'subtype' | 'institution' | 'currency'> & {
  initialBalance?: string;
};

export function AddAccountModal({
  type,
  account,
  onClose,
  onSaved,
}: {
  type: 'ASSET' | 'LIABILITY';
  account?: AccountLite;         // presence switches to edit mode
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!account;

  const [name, setName] = useState(account?.name ?? '');
  const [subtype, setSubtype] = useState(account?.subtype ?? SUBTYPES[type][0].value);
  const [institution, setInstitution] = useState(account?.institution ?? '');
  const [initialBalance, setInitialBalance] = useState(account?.initialBalance ?? '0');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        type,
        subtype,
        institution: institution.trim() || undefined,
        initialBalance: Number(initialBalance) || 0,
      };
      return isEdit
        ? api.patch(`/accounts/${account!.id}`, body)
        : api.post('/accounts', body);
    },
    onSuccess: onSaved,
  });

  const archive = useMutation({
    mutationFn: () => api.delete(`/accounts/${account!.id}`),
    onSuccess: onSaved,
  });

  const noun = type === 'ASSET' ? 'actif' : 'passif';
  const title = isEdit ? `Modifier ${account!.name}` : `Ajouter un ${noun}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-400 text-xl leading-none px-2" aria-label="Fermer">×</button>
        </header>

        <div className="p-4 space-y-3">
          <Field label="Nom">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'ASSET' ? 'Compte chèque BNC' : 'Mastercard'}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Type">
            <select
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900"
            >
              {SUBTYPES[type].map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Institution (optionnel)">
            <input
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              placeholder="BNC, Desjardins, Tangerine…"
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm"
            />
          </Field>

          <Field label={type === 'ASSET' ? 'Solde initial' : 'Solde dû initial'}>
            <input
              type="number"
              step="0.01"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 rounded-md px-3 py-2 text-sm tabular-nums"
            />
            {isEdit && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Modifier ce solde recalcule le solde courant (initial + toutes les transactions).
              </p>
            )}
          </Field>

          {(save.error || archive.error) && (
            <p className="text-sm text-cat-red-fg bg-cat-red-bg rounded-md px-3 py-2">
              {((save.error ?? archive.error) as Error).message}
            </p>
          )}
        </div>

        <footer className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-2">
          {isEdit ? (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-cat-red-fg">Archiver ce compte ?</span>
                <button
                  onClick={() => archive.mutate()}
                  disabled={archive.isPending}
                  className="px-3 py-1 bg-cat-red-fg text-white rounded text-xs font-medium"
                >
                  {archive.isPending ? '…' : 'Oui, archiver'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-600 dark:text-gray-400">Annuler</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-sm text-cat-red-fg hover:underline"
              >
                Archiver
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800">
              Annuler
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={!name.trim() || save.isPending}
              className="px-4 py-1.5 bg-cat-teal-fg text-white rounded-md text-sm font-medium disabled:opacity-40 hover:bg-cat-teal-fg/90"
            >
              {save.isPending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600 dark:text-gray-400 font-medium block mb-1">{label}</span>
      {children}
    </label>
  );
}
