import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, BudgetDirection, Category, CategoryDirection } from '../../lib/api';
import { isSelectableCategory } from '../../lib/categories';
import { formatCurrency } from '../../lib/format';

const DIRECTION_LABELS_FR: Record<CategoryDirection, string> = {
  EXPENSE: 'Dépenses',
  INCOME: 'Revenus',
  NEUTRAL: 'Neutres',
  TRANSFER: 'Transferts',
};

/**
 * Groupe une liste de catégories par direction pour l'affichage en optgroup.
 * L'ordre EXPENSE → INCOME → NEUTRAL est intentionnel : c'est l'ordre le plus
 * naturel pour un budget centré sur les dépenses.
 */
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
  // Couleur du total : rouge si dépense sortante, vert si revenu ou
  // remboursement dans une catégorie dépense (crédit qui allège la dépense).
  // Chaque token a un variant dark: pour rester lisible sur fond sombre.
  const totalColor =
    (direction === 'EXPENSE' && group.total > 0)
      ? 'text-cat-green-fg dark:text-cat-green' // remboursement dans une catégorie dépense
      : isSpendOverflow
        ? 'text-cat-red-fg dark:text-cat-red'
        : direction === 'INCOME'
          ? 'text-cat-green-fg dark:text-cat-green'
          : 'text-gray-900 dark:text-gray-100';

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition"
      >
        <span className="text-gray-500 dark:text-gray-300 text-sm leading-none w-4">
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
  const [learnRule, setLearnRule] = useState(false);
  const amt = Number(tx.amount);
  const isCredit = amt > 0;

  // Exclut les catégories techniques (Remboursement, Transfert, etc.) mais
  // affiche TOUTES les directions — un crédit peut légitimement aller dans
  // une catégorie EXPENSE (remboursement marchand qui nette la dépense) et
  // un débit dans INCOME (chargeback qui réduit le revenu). Grouper par
  // direction (optgroup) donne la structure sans imposer une contrainte.
  const compatible = categories.filter((c) => isSelectableCategory(c.slug));
  const grouped = groupByDirection(compatible);

  const update = useMutation({
    mutationFn: (newCategoryId: string | null) =>
      api.patch<TxRow>(`/transactions/${tx.id}`, {
        categoryId: newCategoryId,
        // learnRule ignoré côté backend si categoryId est null.
        ...(learnRule && newCategoryId ? { learnRule: true } : {}),
      }),
    onSuccess: () => {
      // Reset la case après un apply réussi pour éviter d'appliquer par
      // inadvertance la même règle au prochain changement de catégorie.
      setLearnRule(false);
      // Invalidations larges : la reclassification affecte les rapports.
      qc.invalidateQueries({ queryKey: ['budget-report', month] });
      qc.invalidateQueries({ queryKey: ['budget-line-tx', month, currentCategoryId] });
      qc.invalidateQueries({ queryKey: ['unbudgeted-tx', month] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
      qc.invalidateQueries({ queryKey: ['csv-mapping-rules'] });
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
      <label
        className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 shrink-0 cursor-pointer select-none"
        title={`Créer une règle : toujours classer les transactions de description exacte "${tx.description}" dans la catégorie choisie ci-contre. Les imports CSV futurs appliqueront cette règle automatiquement.`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={learnRule}
          onChange={(e) => setLearnRule(e.target.checked)}
          disabled={update.isPending}
          className="w-3 h-3 accent-cat-teal-fg"
        />
        <span className="hidden md:inline">règle</span>
      </label>
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
      <span
        className={`tabular-nums font-medium w-20 text-right shrink-0 ${
          isCredit ? 'text-cat-green-fg dark:text-cat-green' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {isCredit ? '+' : ''}
        {formatCurrency(tx.amount, true)}
      </span>
    </li>
  );
}
