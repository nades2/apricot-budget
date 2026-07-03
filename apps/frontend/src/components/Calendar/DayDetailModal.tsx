import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, CategoryDirection } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

/**
 * Full transaction as returned by /api/transactions (bigger than the calendar's
 * trimmed CalendarTx — includes account name, category, etc.).
 */
type TxDetail = {
  id: string;
  description: string;
  amount: string;
  postedAt: string;
  notes: string | null;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    direction: CategoryDirection;
  } | null;
  account: { id: string; name: string; type: 'ASSET' | 'LIABILITY' };
};

export function DayDetailModal({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  // Fetch every transaction for this single day.
  const { data, isLoading, error } = useQuery({
    queryKey: ['tx-day', date],
    queryFn: () => api.get<TxDetail[]>(`/transactions?from=${date}&to=${date}&limit=500`),
  });

  // Close on ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const debit = (data ?? [])
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const credit = (data ?? [])
    .filter((t) => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{formatDate(date)}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {data ? `${data.length} transaction${data.length > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2"
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Chargement…</p>}
          {error && <p className="p-4 text-sm text-red-600">Erreur : {(error as Error).message}</p>}

          {data && data.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-400">Aucune transaction ce jour-là.</p>
          )}

          {data && data.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.map((tx) => <TxItem key={tx.id} tx={tx} />)}
            </ul>
          )}
        </div>

        {data && data.length > 0 && (
          <footer className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex gap-4 text-xs text-gray-600">
            <span>
              <span className="text-cat-red-fg font-medium">− {formatCurrency(debit, true)}</span>
              <span className="ml-1 text-gray-500 dark:text-gray-400">dépenses</span>
            </span>
            <span>
              <span className="text-cat-green-fg font-medium">+ {formatCurrency(credit, true)}</span>
              <span className="ml-1 text-gray-500 dark:text-gray-400">revenus</span>
            </span>
            <span className="ml-auto">
              Net :{' '}
              <b className={credit - debit >= 0 ? 'text-cat-green-fg' : 'text-cat-red-fg'}>
                {formatCurrency(credit - debit, true)}
              </b>
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}

function TxItem({ tx }: { tx: TxDetail }) {
  const amt = Number(tx.amount);
  const isCredit = amt > 0;
  const color = tx.category?.color ?? 'gray';
  const bgClass = isCredit ? 'bg-cat-teal-bg text-cat-teal-fg' : `bg-cat-${color}-bg text-cat-${color}-fg`;

  return (
    <li className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:bg-gray-800/40 dark:hover:bg-gray-800/50">
      <span className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium ${bgClass}`}>
        {tx.category?.name?.[0]?.toUpperCase() ?? '?'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{tx.description}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-2">
          <span>{tx.category?.name ?? 'Non catégorisé'}</span>
          <span className="text-gray-300">·</span>
          <span>{tx.account.name}</span>
        </div>
      </div>
      <div className={`text-sm tabular-nums font-medium ${isCredit ? 'text-cat-green-fg' : 'text-gray-800 dark:text-gray-100'}`}>
        {isCredit ? '+' : ''}{formatCurrency(tx.amount, true)}
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
