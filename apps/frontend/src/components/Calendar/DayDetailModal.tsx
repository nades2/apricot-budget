import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Category, CategoryDirection } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

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
  const { data, isLoading, error } = useQuery({
    queryKey: ['tx-day', date],
    queryFn: () => api.get<TxDetail[]>(`/transactions?from=${date}&to=${date}&limit=500`),
  });

  // Categories chargees une seule fois pour la modale.
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

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
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {formatDate(date)}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {data ? `${data.length} transaction${data.length > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none px-2"
            aria-label="Fermer"
          >
            &times;
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Chargement...</p>}
          {error && <p className="p-4 text-sm text-red-600">Erreur : {(error as Error).message}</p>}

          {data && data.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
              Aucune transaction ce jour-la.
            </p>
          )}

          {data && data.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.map((tx) => (
                <TxItem key={tx.id} tx={tx} categories={categories ?? []} dayDate={date} />
              ))}
            </ul>
          )}
        </div>

        {data && data.length > 0 && (
          <footer className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex gap-4 text-xs text-gray-600 dark:text-gray-400">
            <span>
              <span className="text-cat-red-fg font-medium">- {formatCurrency(debit, true)}</span>
              <span className="ml-1 text-gray-500 dark:text-gray-400">depenses</span>
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

/**
 * Ligne de transaction.
 * Clic sur la pastille categorie ou le nom de categorie => passe en mode edition
 * inline avec un <select>. Sauvegarde a la selection ou clic dehors.
 */
function TxItem({
  tx,
  categories,
  dayDate,
}: {
  tx: TxDetail;
  categories: Category[];
  dayDate: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const amt = Number(tx.amount);
  const isCredit = amt > 0;
  const color = tx.category?.color ?? 'gray';
  const bgClass = isCredit
    ? 'bg-cat-teal-bg text-cat-teal-fg'
    : `bg-cat-${color}-bg text-cat-${color}-fg`;

  const update = useMutation({
    mutationFn: (categoryId: string | null) =>
      api.patch<TxDetail>(`/transactions/${tx.id}`, { categoryId }),
    onSuccess: () => {
      // Rafraichir : la journee courante, le calendrier, le rapport budget,
      // le forecast (une reclassification INCOME/EXPENSE peut changer les KPIs).
      qc.invalidateQueries({ queryKey: ['tx-day', dayDate] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['budget-report'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
      setEditing(false);
    },
  });

  // Filtre : les revenus n ont pas de sens en categorie EXPENSE et vice versa.
  // Autorise NEUTRAL/TRANSFER dans les deux cas + suggere les bonnes en tete.
  const compatibleCategories = categories.filter((c) => {
    if (isCredit) return c.direction === 'INCOME' || c.direction === 'NEUTRAL' || c.direction === 'TRANSFER';
    return c.direction === 'EXPENSE' || c.direction === 'NEUTRAL' || c.direction === 'TRANSFER';
  });

  return (
    <li className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <button
        onClick={() => setEditing((v) => !v)}
        className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium shrink-0 ${bgClass} hover:ring-2 hover:ring-cat-teal-fg transition`}
        title="Changer la categorie"
        disabled={update.isPending}
      >
        {tx.category?.name?.[0]?.toUpperCase() ?? '?'}
      </button>

      <div className="flex-1 min-w-0">
        <div className="text-sm truncate text-gray-900 dark:text-gray-100 font-medium">
          {tx.description}
        </div>

        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <select
              value={tx.category?.id ?? ''}
              onChange={(e) => update.mutate(e.target.value || null)}
              autoFocus
              disabled={update.isPending}
              className="text-xs rounded px-1.5 py-0.5
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
            >
              <option value="">-- Non categorisee --</option>
              {compatibleCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => setEditing(false)}
              disabled={update.isPending}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {update.isPending ? '...' : 'annuler'}
            </button>
          </div>
        ) : (
          <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-1.5 items-center">
            <button
              onClick={() => setEditing(true)}
              className="hover:text-gray-900 dark:hover:text-gray-100 hover:underline transition"
              title="Changer la categorie"
            >
              {tx.category?.name ?? 'Non categorise'}
            </button>
            <span className="text-gray-300 dark:text-gray-600">&middot;</span>
            <span>{tx.account.name}</span>
          </div>
        )}
      </div>

      <div className={`text-sm tabular-nums font-medium ${
        isCredit ? 'text-cat-green-fg' : 'text-gray-900 dark:text-gray-100'
      }`}>
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
