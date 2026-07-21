import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, BudgetDirection, Category, CategoryDirection } from '../../lib/api';
import { isSelectableCategory } from '../../lib/categories';
import { formatCurrency } from '../../lib/format';

/**
 * Détail extensible d'un poste budgété : liste les transactions de la
 * catégorie pour le mois affiché, groupées par marchand (description
 * normalisée) et triées par montant décroissant. Chaque groupe est
 * extensible pour voir les transactions individuelles, avec un dropdown
 * inline pour reclassifier une transaction sans quitter la page Budget.
 *
 * Rendu inline dans <BudgetLineTable> (pas de modal) — cohérent avec
 * l'esprit "minimum de clics" du design system Apricot.
 *
 * Note Phase 1/2 splits : on filtre par `transaction.categoryId` (denormalisé
 * vers le 1er split), comme UnbudgetedDetailModal. Les transactions splittées
 * dont le 1er split n'est PAS cette catégorie n'apparaîtront pas — à
 * revisiter si le split multi-catégorie devient courant.
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

/**
 * Normalise une description pour regrouper les variantes du même marchand
 * (ex. "TIM HORTONS #1234 MONTREAL" et "TIM HORTONS QC" → "tim hortons").
 * Enlève les numéros, la ponctuation, les mots trop courts, et normalise
 * la casse. Rustique mais robuste pour le CSV BNC.
 */
function normalizeMerchant(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[#\-_.,;:*/\\]+/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length >= 3)
    .slice(0, 3)
    .join(' ') || desc.toLowerCase().trim();
}

/** Formate "2025-12-31T…" en "31 déc." */
function formatDate(iso: string): string {
  const raw = iso.slice(0, 10);
  const d = new Date(raw + 'T00:00:00Z');
  return d
    .toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .replace('.', '');
}

export function BudgetLineDetail({
  month,
  categoryId,
  direction,
}: {
  /** YYYY-MM du mois affiché */
  month: string;
  categoryId: string;
  direction: BudgetDirection;
}) {
  const [year, mon] = month.split('-').map(Number);
  const from = `${year}-${String(mon).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const to = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['budget-line-tx', month, categoryId],
    queryFn: () =>
      api.get<TxRow[]>(
        `/transactions?from=${from}&to=${to}&categoryId=${categoryId}&limit=500`,
      ),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  // Regroupement par marchand normalisé. Les remboursements (montant du signe
  // opposé à la direction du poste) sont inclus — ils comptent dans le net
  // dépensé, ce qui est cohérent avec le calcul du "actual" côté serveur.
  const groups = useMemo(() => {
    if (!transactions) return [];
    const byMerchant = new Map<
      string,
      { label: string; total: number; txs: TxRow[] }
    >();
    for (const tx of transactions) {
      const key = normalizeMerchant(tx.description);
      const bucket = byMerchant.get(key);
      const amount = Number(tx.amount);
      if (bucket) {
        bucket.total += amount;
        bucket.txs.push(tx);
      } else {
        // Label = la 1re description entière rencontrée, en title-case léger.
        byMerchant.set(key, {
          label: tx.description,
          total: amount,
          txs: [tx],
        });
      }
    }
    // Tri : magnitude décroissante (les plus gros marchands en premier).
    return Array.from(byMerchant.values()).sort(
      (a, b) => Math.abs(b.total) - Math.abs(a.total),
    );
  }, [transactions]);

  if (isLoading) {
    return (
      <div className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        Chargement des transactions…
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 italic">
        Aucune transaction dans cette catégorie pour ce mois.
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        {transactions.length} transaction{transactions.length > 1 ? 's' : ''} ·
        <span className="ml-1">{groups.length} marchand{groups.length > 1 ? 's' : ''}</span>
      </div>
      <ul className="border border-gray-200 dark:border-gray-800 rounded-md divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
        {groups.map((g, i) => (
          <MerchantGroup
            key={i}
            group={g}
            direction={direction}
            categories={categories ?? []}
            month={month}
            categoryId={categoryId}
          />
        ))}
      </ul>
    </div>
  );
}

function MerchantGroup({
  group,
  direction,
  categories,
  month,
  categoryId,
}: {
  group: { label: string; total: number; txs: TxRow[] };
  direction: BudgetDirection;
  categories: Category[];
  month: string;
  categoryId: string;
}) {
  const [open, setOpen] = useState(group.txs.length === 1);
  const isSpendOverflow = direction === 'EXPENSE' && group.total < 0;
  // Couleur du total : rouge si dépense, vert si revenu, ambre pour remboursement.
  const totalColor =
    (direction === 'EXPENSE' && group.total > 0)
      ? 'text-cat-green-fg' // remboursement dans une catégorie dépense
      : isSpendOverflow
        ? 'text-cat-red-fg'
        : direction === 'INCOME'
          ? 'text-cat-green-fg'
          : 'text-gray-900 dark:text-gray-100';

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition"
      >
        <span className="text-gray-400 dark:text-gray-500 text-xs w-3">
          {open ? '▾' : '▸'}
        </span>
        <span className="flex-1 min-w-0 text-sm truncate text-gray-800 dark:text-gray-100">
          {group.label}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          ×{group.txs.length}
        </span>
        <span className={`text-sm tabular-nums font-medium w-24 text-right ${totalColor}`}>
          {formatCurrency(Math.abs(group.total), true)}
        </span>
      </button>

      {open && (
        <ul className="bg-gray-50/60 dark:bg-gray-800/20 divide-y divide-gray-100 dark:divide-gray-800">
          {group.txs.map((tx) => (
            <TxItem
              key={tx.id}
              tx={tx}
              categories={categories}
              month={month}
              currentCategoryId={categoryId}
            />
          ))}
        </ul>
      )}
    </li>
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
  currentCategoryId: string;
}) {
  const qc = useQueryClient();
  const amt = Number(tx.amount);
  const isCredit = amt > 0;

  // Filtre les catégories compatibles avec le signe de la transaction, en
  // excluant les catégories techniques (Remboursement, Transfert, etc.) que
  // l'user ne doit pas choisir manuellement — voir lib/categories.ts.
  const compatible = categories.filter((c) => {
    if (!isSelectableCategory(c.slug)) return false;
    if (isCredit) return c.direction === 'INCOME' || c.direction === 'NEUTRAL';
    return c.direction === 'EXPENSE' || c.direction === 'NEUTRAL';
  });

  const update = useMutation({
    mutationFn: (newCategoryId: string | null) =>
      api.patch<TxRow>(`/transactions/${tx.id}`, { categoryId: newCategoryId }),
    onSuccess: () => {
      // Invalidations larges : la reclassification affecte les rapports.
      qc.invalidateQueries({ queryKey: ['budget-report', month] });
      qc.invalidateQueries({ queryKey: ['budget-line-tx', month, currentCategoryId] });
      qc.invalidateQueries({ queryKey: ['unbudgeted-tx', month] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
    },
  });

  return (
    <li className="pl-8 pr-3 py-1.5 flex items-center gap-3 text-xs hover:bg-white dark:hover:bg-gray-800/40 transition">
      <span className="text-gray-500 dark:text-gray-400 w-14 shrink-0 tabular-nums">
        {formatDate(tx.postedAt)}
      </span>
      <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">
        {tx.description}
      </span>
      <span className="text-gray-400 dark:text-gray-500 truncate max-w-[100px] hidden sm:inline">
        {tx.account.name}
      </span>
      <select
        value={tx.category?.id ?? ''}
        onChange={(e) => update.mutate(e.target.value || null)}
        disabled={update.isPending}
        onClick={(e) => e.stopPropagation()}
        className="text-xs rounded px-1.5 py-0.5
                   border border-gray-300 dark:border-gray-700
                   bg-white dark:bg-gray-900
                   text-gray-900 dark:text-gray-100
                   focus:outline-none focus:ring-1 focus:ring-cat-teal-fg
                   max-w-[150px]"
        title="Réassigner à une catégorie"
      >
        <option value="">-- Non catégorisée --</option>
        {compatible.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <span
        className={`tabular-nums font-medium w-20 text-right shrink-0 ${
          isCredit ? 'text-cat-green-fg' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {isCredit ? '+' : ''}
        {formatCurrency(tx.amount, true)}
      </span>
    </li>
  );
}
