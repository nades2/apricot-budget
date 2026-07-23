import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Account } from '../lib/api';
import { formatCurrency } from '../lib/format';
import { AccountCard } from '../components/Accounts/AccountCard';
import { AddAccountModal } from '../components/Accounts/AddAccountModal';

/**
 * Reused for both /actifs and /passifs by passing a different `type`.
 * Keeps the page shell (title, total, add button, grid) in one place.
 */
export function AccountsPage({ type }: { type: 'ASSET' | 'LIABILITY' }) {
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts', type],
    queryFn: () => api.get<Account[]>(`/accounts?type=${type}`),
  });

  const total = (accounts ?? []).reduce((s, a) => s + Number(a.currentBalance), 0);
  const label = type === 'ASSET' ? 'Actifs' : 'Passifs';
  const noun = type === 'ASSET' ? 'actif' : 'passif';
  const totalColor = type === 'ASSET' ? 'text-cat-green-fg dark:text-cat-green' : 'text-cat-red-fg dark:text-cat-red';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">{label}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Total : <b className={totalColor}>{formatCurrency(total, true)}</b>
            {accounts && <span className="ml-2 text-gray-400">· {accounts.length} compte{accounts.length > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-cat-teal-fg text-white rounded-md text-sm font-medium hover:bg-cat-teal-fg/90"
        >
          + Ajouter un {noun}
        </button>
      </header>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}

      {accounts && accounts.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-lg p-10 text-center text-sm text-gray-500">
          Aucun {noun} pour l'instant. Clique sur "Ajouter" pour créer le premier.
        </div>
      )}

      {accounts && accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((a) => <AccountCard key={a.id} account={a} />)}
        </div>
      )}

      {showAdd && (
        <AddAccountModal
          type={type}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['accounts', type] });
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}
