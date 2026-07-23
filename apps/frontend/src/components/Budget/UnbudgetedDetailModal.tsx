import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, Category, CategoryDirection } from '../../lib/api';
import { isSelectableCategory } from '../../lib/categories';
import { formatCurrency } from '../../lib/format';

const DIRECTION_LABELS_FR: Record<CategoryDirection, string> = {
  EXPENSE: 'Dépenses',
  INCOME: 'Revenus',
  NEUTRAL: 'Neutres',
  TRANSFER: 'Transferts',
};

function groupByDirection(cats: Category[]): [CategoryDirection, Category[]][] {
  const groups: Record<CategoryDirection, Category[]> = {
    EXPENSE: [], INCOME: [], NEUTRAL: [], TRANSFER: [],
  };
  for (const c of cats) groups[c.direction].push(c);
  const order: CategoryDirection[] = ['EXPENSE', 'INCOME', 'NEUTRAL', 'TRANSFER'];
  return order
    .map((d) => [d, groups[d]] as [CategoryDirection, Category[]])
    .filter(([, list]) => list.length > 0);
}

/**
 * Détail d'une ligne "Hors budget" : liste les transactions de la catégorie
 * (ou non catégorisées) pour le mois affiché, avec un dropdown inline pour
 * réassigner chaque transaction à une autre catégorie sans quitter la page.
 *
 * Après une réassignation, on invalide `budget-report` et `calendar` pour
 * que la table Hors budget reflète immédiatement le changement (la row peut
 * disparaître si elle devient vide ou si elle bascule vers une catégorie
 * budgétée).
 */
type TxRow = {
  id: string;
  postedAt: string;
  description: string;
  amount: string;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    direction: CategoryDirection;
  } | null;
  account: { id: string; name: string; type: 'ASSET' | 'LIABILITY' };
};

export function UnbudgetedDetailModal({
  month,
  categoryId,
  categoryName,
  onClose,
}: {
  /** YYYY-MM du mois affiché */
  month: string;
  /** null pour les non-catégorisées */
  categoryId: string | null;
  categoryName: string;
  /**
   * Direction non utilisée directement dans le modal — le filtre de
   * catégories compatibles est basé sur le signe individuel de chaque
   * transaction. Gardée dans l'API publique du modal pour cohérence
   * sémantique (utile si on ajoute un badge de direction dans le header).
   */
  direction?: 'EXPENSE' | 'INCOME';
  onClose: () => void;
}) {
  // Fenêtre du mois (from = 1er, to = dernier jour).
  const [year, mon] = month.split('-').map(Number);
  const from = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const to = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const queryParams = categoryId
    ? `?from=${from}&to=${to}&categoryId=${categoryId}&limit=500`
    : `?from=${from}&to=${to}&uncategorized=true&limit=500`;

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['unbudgeted-tx', month, categoryId ?? 'null'],
    queryFn: () => api.get<TxRow[]>(`/transactions${queryParams}`),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {categoryName}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {transactions
                ? `${transactions.length} transaction${transactions.length > 1 ? 's' : ''} · ${month}`
                : month}
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
          {isLoading && (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Chargement…</p>
          )}

          {transactions && transactions.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-400 dark:text-gray-500 italic">
              Plus aucune transaction dans cette catégorie pour ce mois.
            </p>
          )}

          {transactions && transactions.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {transactions.map((tx) => (
                <TxItem
                  key={tx.id}
                  tx={tx}
                  categories={categories ?? []}
                  month={month}
                  currentCategoryId={categoryId}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function TxItem({
  tx,
  categories,
  month,
  currentCategoryId,
}: {
  tx: TxRow;
  categories: Category[];
  month: string;
  currentCategoryId: string | null;
}) {
  const qc = useQueryClient();
  const [learnRule, setLearnRule] = useState(false);
  const amt = Number(tx.amount);
  const isCredit = amt > 0;

  // Exclut les catégories techniques mais affiche toutes les directions —
  // un crédit peut aller dans une catégorie EXPENSE (remboursement marchand
  // qui nette la dépense) et un débit dans INCOME (chargeback qui réduit le
  // revenu). Voir BudgetLineDetail pour la même logique.
  const compatible = categories.filter((c) => isSelectableCategory(c.slug));
  const grouped = groupByDirection(compatible);

  const update = useMutation({
    mutationFn: (newCategoryId: string | null) =>
      api.patch<TxRow>(`/transactions/${tx.id}`, {
        categoryId: newCategoryId,
        ...(learnRule && newCategoryId ? { learnRule: true } : {}),
      }),
    onSuccess: () => {
      setLearnRule(false);
      qc.invalidateQueries({ queryKey: ['budget-report', month] });
      qc.invalidateQueries({ queryKey: ['unbudgeted-tx', month, currentCategoryId ?? 'null'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
      qc.invalidateQueries({ queryKey: ['csv-mapping-rules'] });
    },
  });

  const color = tx.category?.color ?? 'gray';
  const bgClass = isCredit
    ? 'bg-cat-teal-bg text-cat-teal-fg'
    : `bg-cat-${color}-bg text-cat-${color}-fg`;

  return (
    <li className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <span
        className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium shrink-0 ${bgClass}`}
      >
        {(tx.category?.name?.[0] ?? '?').toUpperCase()}
      </span>

      <div className="flex-1 min-w-0">
        <div className="text-sm truncate text-gray-900 dark:text-gray-100 font-medium">
          {tx.description}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-1.5 items-center flex-wrap">
          <span>{formatDate(tx.postedAt)}</span>
          <span className="text-gray-300 dark:text-gray-600">&middot;</span>
          <span>{tx.account.name}</span>
        </div>
      </div>

      <label
        className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 shrink-0 cursor-pointer select-none"
        title={`Créer une règle : toujours classer les transactions de description exacte "${tx.description}" dans la catégorie choisie ci-contre. Les imports CSV futurs appliqueront cette règle automatiquement.`}
      >
        <input
          type="checkbox"
          checked={learnRule}
          onChange={(e) => setLearnRule(e.target.checked)}
          disabled={update.isPending}
          className="w-3 h-3 accent-cat-teal-fg"
        />
        <span>règle</span>
      </label>

      <select
        value={tx.category?.id ?? ''}
        onChange={(e) => update.mutate(e.target.value || null)}
        disabled={update.isPending}
        className="text-xs rounded px-1.5 py-1
                   border border-gray-300 dark:border-gray-700
                   bg-white dark:bg-gray-900
                   text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-1 focus:ring-cat-teal-fg
                   max-w-[180px]"
        title="Réassigner à une catégorie"
      >
        <option value="">-- Non catégorisée --</option>
        {grouped.map(([dir, list]) => (
          <optgroup key={dir} label={DIRECTION_LABELS_FR[dir]}>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div
        className={`text-sm tabular-nums font-medium w-24 text-right shrink-0 ${
          isCredit ? 'text-cat-green-fg dark:text-cat-green' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {isCredit ? '+' : ''}
        {formatCurrency(tx.amount, true)}
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  // Prend juste "YYYY-MM-DD" et sort "DD MMM".
  const raw = iso.slice(0, 10);
  const d = new Date(raw + 'T00:00:00Z');
  return d.toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).replace('.', '');
}
