import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Account } from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import { Sparkline } from './Sparkline';
import { AddAccountModal } from './AddAccountModal';

type Evolution = {
  accountId: string;
  from: string;
  to: string;
  points: { date: string; balance: string }[];
};

const SUBTYPE_LABEL: Record<string, string> = {
  CHECKING: 'Compte chèque', SAVINGS: 'Épargne', INVESTMENT: 'Placement',
  REAL_ESTATE: 'Immobilier', VEHICLE: 'Véhicule', OTHER_ASSET: 'Autre',
  CREDIT_CARD: 'Carte de crédit', MORTGAGE: 'Hypothèque', LOAN: 'Prêt',
  LINE_OF_CREDIT: 'Marge de crédit', OTHER_LIABILITY: 'Autre',
};

export function AccountCard({ account }: { account: Account }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: evo } = useQuery({
    queryKey: ['account-evolution', account.id],
    queryFn: () => api.get<Evolution>(`/accounts/${account.id}/evolution?days=30`),
    staleTime: 60_000,
  });

  const color = account.type === 'ASSET' ? 'cat-teal' : 'cat-red';
  const bal = Number(account.currentBalance);
  const initial = evo?.points[0] ? Number(evo.points[0].balance) : bal;
  const delta = bal - initial;

  return (
    <>
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-700 transition relative group">
      <button
        onClick={() => setEditing(true)}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300 text-sm"
        aria-label="Modifier"
        title="Modifier"
      >
        ✎
      </button>
      <div className="flex items-start justify-between mb-3 pr-6">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{account.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-0.5">
            {SUBTYPE_LABEL[account.subtype] ?? account.subtype}
            {account.institution && <span> · {account.institution}</span>}
          </div>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium bg-${color}-bg text-${color}-fg`}>
          {account.type === 'ASSET' ? 'Actif' : 'Passif'}
        </span>
      </div>

      <div className="mb-3">
        <div className="text-2xl font-semibold tabular-nums">
          {formatCurrency(account.currentBalance, true)}
        </div>
        {evo && (
          <div className={`text-xs mt-0.5 ${delta >= 0 ? 'text-cat-green-fg dark:text-cat-green' : 'text-cat-red-fg dark:text-cat-red'}`}>
            {delta >= 0 ? '+' : ''}{formatCurrency(delta, true)} sur 30 j
          </div>
        )}
      </div>

      {evo && evo.points.length > 1 && (
        <Sparkline points={evo.points.map((p) => Number(p.balance))} accent={account.type} />
      )}
    </div>

    {editing && (
      <AddAccountModal
        type={account.type}
        account={account}
        onClose={() => setEditing(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['accounts', account.type] });
          qc.invalidateQueries({ queryKey: ['account-evolution', account.id] });
          setEditing(false);
        }}
      />
    )}
    </>
  );
}
