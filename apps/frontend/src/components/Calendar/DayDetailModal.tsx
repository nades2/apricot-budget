import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  Category,
  CategoryDirection,
  OverflowItem,
  PlannedGhost,
} from '../../lib/api';
import { formatCurrency } from '../../lib/format';

type SplitLine = {
  id: string;
  amount: string;              // signed Decimal string
  notes?: string | null;
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    direction: CategoryDirection;
  } | null;
};

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
  /** ≥1 après Phase 1. Représentation atomique de la répartition. */
  splits: SplitLine[];
};

export function DayDetailModal({
  date,
  plannedGhosts = [],
  overflowItems = [],
  onClose,
}: {
  date: string;
  /** Planned occurrences for that day (from the calendar response). */
  plannedGhosts?: PlannedGhost[];
  /**
   * Items that overflowed the cell's `topPerDay` cap. Backend already lists
   * their name + signed amount; some may be real transactions (also in the
   * `data` list below), others are ghosts (already in `plannedGhosts`). We
   * still show a small "reste tronqué" block for parity.
   */
  overflowItems?: OverflowItem[];
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
              {data
                ? `${data.length} transaction${data.length > 1 ? 's' : ''}`
                : ''}
              {plannedGhosts.length > 0 && (
                <>
                  {data && data.length > 0 ? ' · ' : ''}
                  {plannedGhosts.length} prévu{plannedGhosts.length > 1 ? 's' : ''}
                </>
              )}
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

          {plannedGhosts.length > 0 && (
            <section>
              <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                Prévu
              </h3>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {plannedGhosts.map((g) => (
                  <GhostItem key={g.budgetItemId} ghost={g} />
                ))}
              </ul>
            </section>
          )}

          {data && data.length === 0 && plannedGhosts.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
              Aucune transaction ce jour-la.
            </p>
          )}

          {data && data.length > 0 && (
            <section>
              {plannedGhosts.length > 0 && (
                <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                  Transactions
                </h3>
              )}
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {data.map((tx) => (
                  <TxItem key={tx.id} tx={tx} categories={categories ?? []} dayDate={date} />
                ))}
              </ul>
            </section>
          )}

          {/*
            Overflow items are usually already covered by the two lists above
            (they were sliced off `transactions` / `plannedGhosts` in the cell,
            but we're not applying that cap in the modal). We only surface
            them as a fallback if the calendar response was itself capped —
            e.g. a very busy day where topPerDay < true count. Rare, but keeps
            the guarantee that opening a day never hides anything.
          */}
          {overflowItems.length > 0 &&
            data &&
            data.length + plannedGhosts.length < overflowItems.length && (
              <section className="border-t border-gray-100 dark:border-gray-800">
                <h3 className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
                  Autres (tronqués)
                </h3>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {overflowItems.map((it, i) => (
                    <li key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">
                        {it.kind === 'ghost' ? 'Prévu' : 'Tx'}
                      </span>
                      <span className="flex-1 truncate text-gray-900 dark:text-gray-100">
                        {it.name}
                      </span>
                      <span
                        className={`tabular-nums font-medium ${
                          Number(it.amountSigned) >= 0
                            ? 'text-cat-green-fg dark:text-cat-green'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {Number(it.amountSigned) >= 0 ? '+' : ''}
                        {formatCurrency(it.amountSigned, true)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
        </div>

        {((data && data.length > 0) || plannedGhosts.length > 0) && (
          <footer className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
            {data && data.length > 0 && (
              <>
                <span>
                  <span className="text-cat-red-fg font-medium">- {formatCurrency(debit, true)}</span>
                  <span className="ml-1 text-gray-500 dark:text-gray-400">depenses</span>
                </span>
                <span>
                  <span className="text-cat-green-fg font-medium">+ {formatCurrency(credit, true)}</span>
                  <span className="ml-1 text-gray-500 dark:text-gray-400">revenus</span>
                </span>
                <span>
                  Net :{' '}
                  <b className={credit - debit >= 0 ? 'text-cat-green-fg' : 'text-cat-red-fg'}>
                    {formatCurrency(credit - debit, true)}
                  </b>
                </span>
              </>
            )}
            {plannedGhosts.length > 0 && (
              <span className="ml-auto italic">
                Prévu net :{' '}
                <b
                  className={
                    plannedNet(plannedGhosts) >= 0 ? 'text-cat-green-fg' : 'text-cat-red-fg'
                  }
                >
                  {formatCurrency(plannedNet(plannedGhosts), true)}
                </b>
              </span>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}

/**
 * Ligne de transaction.
 *
 * Trois modes d'édition inline :
 *   - none     — affichage seul
 *   - category — dropdown de re-catégorisation (transaction à split unique)
 *   - split    — éditeur multi-lignes (montant + catégorie par ligne),
 *                validation stricte : la somme doit égaler le montant parent.
 *
 * L'affichage compact quand plusieurs splits : "Épicerie +2" avec tooltip
 * listant les catégories complètes.
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
  const [mode, setMode] = useState<'none' | 'category' | 'split'>('none');

  const amt = Number(tx.amount);
  const isCredit = amt > 0;
  const splitCount = tx.splits?.length ?? 0;
  const isMultiSplit = splitCount > 1;

  // La pastille utilise la couleur de la première catégorie (ou gray).
  // Le fond "credit" (revenu) l'emporte visuellement — cohérent avec le passé.
  const primaryColor = tx.splits?.[0]?.category?.color ?? tx.category?.color ?? 'gray';
  const bgClass = isCredit
    ? 'bg-cat-teal-bg text-cat-teal-fg'
    : `bg-cat-${primaryColor}-bg text-cat-${primaryColor}-fg`;

  // Filtre : les revenus n ont pas de sens en categorie EXPENSE et vice versa.
  // Autorise NEUTRAL/TRANSFER dans les deux cas.
  const compatibleCategories = categories.filter((c) => {
    if (isCredit) return c.direction === 'INCOME' || c.direction === 'NEUTRAL' || c.direction === 'TRANSFER';
    return c.direction === 'EXPENSE' || c.direction === 'NEUTRAL' || c.direction === 'TRANSFER';
  });

  const updateCategory = useMutation({
    mutationFn: (categoryId: string | null) =>
      api.patch<TxDetail>(`/transactions/${tx.id}`, { categoryId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tx-day', dayDate] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['budget-report'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
      setMode('none');
    },
  });

  // Résumé "Épicerie +2" ou juste le nom si un seul split. Le tooltip contient
  // le détail complet des catégories.
  const summaryLabel = useMemo(() => {
    if (splitCount <= 1) {
      const name = tx.splits?.[0]?.category?.name ?? tx.category?.name ?? 'Non categorise';
      return { label: name, tooltip: name };
    }
    const first = tx.splits[0]?.category?.name ?? 'Non categorise';
    const rest = splitCount - 1;
    const allNames = tx.splits
      .map((s) => s.category?.name ?? 'Non categorise')
      .join(', ');
    return { label: `${first} +${rest}`, tooltip: allNames };
  }, [tx.splits, tx.category, splitCount]);

  return (
    <li className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            // Pill click : ouvre l'éditeur adapté à l'état actuel.
            //  - transaction simple  → dropdown catégorie
            //  - transaction splittée → éditeur multi-lignes
            if (isMultiSplit) setMode((m) => (m === 'split' ? 'none' : 'split'));
            else setMode((m) => (m === 'category' ? 'none' : 'category'));
          }}
          className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium shrink-0 ${bgClass} hover:ring-2 hover:ring-cat-teal-fg transition`}
          title={isMultiSplit ? 'Modifier les splits' : 'Changer la catégorie'}
          disabled={updateCategory.isPending}
        >
          {(tx.splits?.[0]?.category?.name?.[0] ?? tx.category?.name?.[0] ?? '?').toUpperCase()}
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-sm truncate text-gray-900 dark:text-gray-100 font-medium">
            {tx.description}
          </div>

          {mode === 'category' && !isMultiSplit ? (
            <div className="flex items-center gap-2 mt-1">
              <select
                value={tx.splits?.[0]?.category?.id ?? tx.category?.id ?? ''}
                onChange={(e) => updateCategory.mutate(e.target.value || null)}
                autoFocus
                disabled={updateCategory.isPending}
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
                onClick={() => setMode('none')}
                disabled={updateCategory.isPending}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {updateCategory.isPending ? '...' : 'annuler'}
              </button>
            </div>
          ) : (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-1.5 items-center flex-wrap">
              <button
                onClick={() => !isMultiSplit && setMode('category')}
                title={summaryLabel.tooltip}
                className={`transition ${isMultiSplit
                  ? 'cursor-default'
                  : 'hover:text-gray-900 dark:hover:text-gray-100 hover:underline'}`}
              >
                {summaryLabel.label}
              </button>
              <span className="text-gray-300 dark:text-gray-600">&middot;</span>
              <span>{tx.account.name}</span>
              <span className="text-gray-300 dark:text-gray-600">&middot;</span>
              <button
                onClick={() => setMode('split')}
                className="hover:text-gray-900 dark:hover:text-gray-100 hover:underline transition italic"
                title={isMultiSplit ? 'Modifier les splits' : 'Diviser en plusieurs catégories'}
              >
                {isMultiSplit ? 'Modifier splits' : 'Diviser'}
              </button>
            </div>
          )}
        </div>

        <div className={`text-sm tabular-nums font-medium ${
          isCredit ? 'text-cat-green-fg' : 'text-gray-900 dark:text-gray-100'
        }`}>
          {isCredit ? '+' : ''}{formatCurrency(tx.amount, true)}
        </div>
      </div>

      {mode === 'split' && (
        <SplitEditor
          tx={tx}
          categories={compatibleCategories}
          dayDate={dayDate}
          onDone={() => setMode('none')}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
//  SplitEditor
//  Éditeur inline multi-lignes. L'utilisateur saisit un montant ABSOLU par
//  ligne — le signe est celui du parent, appliqué au moment du save. La somme
//  des valeurs absolues doit égaler |tx.amount| pour activer le bouton Save.
// ---------------------------------------------------------------------------

type Draft = {
  key: string;                 // stable local id pour React
  categoryId: string | null;
  amount: string;              // valeur absolue en input ("15.50")
  notes: string;
};

function makeDraft(categoryId: string | null, absAmount: string): Draft {
  return {
    key: crypto.randomUUID(),
    categoryId,
    amount: absAmount,
    notes: '',
  };
}

/** Somme des montants (valeur absolue), avec 2 décimales de précision. */
function sumAmounts(drafts: Draft[]): number {
  const total = drafts.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}

function SplitEditor({
  tx,
  categories,
  dayDate,
  onDone,
}: {
  tx: TxDetail;
  categories: Category[];
  dayDate: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const parentAmount = Number(tx.amount);
  const parentAbs = Math.abs(parentAmount);
  const parentSign = parentAmount < 0 ? -1 : 1;

  // Initial state — issu des splits existants (≥1 après Phase 1).
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    if (tx.splits && tx.splits.length > 0) {
      return tx.splits.map((s) => makeDraft(
        s.category?.id ?? null,
        Math.abs(Number(s.amount)).toFixed(2),
      ));
    }
    // Fallback : pas de splits (ne devrait plus arriver après Phase 1).
    return [makeDraft(tx.category?.id ?? null, parentAbs.toFixed(2))];
  });

  const [error, setError] = useState<string | null>(null);

  const currentSum = sumAmounts(drafts);
  const remaining = Math.round((parentAbs - currentSum) * 100) / 100;
  const balanced = Math.abs(remaining) < 0.005;

  const save = useMutation({
    mutationFn: async () => {
      // Convertit chaque ligne en signed amount pour le backend.
      const payload = {
        splits: drafts.map((d, i) => ({
          categoryId: d.categoryId,
          amount: parentSign * Number(d.amount),
          notes: d.notes.trim() || undefined,
          sortOrder: i,
        })),
      };
      return api.put<TxDetail>(`/transactions/${tx.id}/splits`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tx-day', dayDate] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['budget-report'] });
      qc.invalidateQueries({ queryKey: ['forecast'] });
      onDone();
    },
    onError: (e: unknown) => setError((e as Error).message),
  });

  const addRow = () => {
    // Nouveau split pré-rempli avec le reste à répartir (min 0).
    const remain = Math.max(remaining, 0);
    setDrafts((prev) => [...prev, makeDraft(null, remain.toFixed(2))]);
  };

  const removeRow = (key: string) => {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.key !== key)));
  };

  const patchRow = (key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const canSave = balanced && drafts.length >= 1 && drafts.every((d) => Number(d.amount) > 0);

  return (
    <div className="mt-3 ml-11 border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/40">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 mb-2">
        Diviser la transaction
      </div>

      <ul className="space-y-1.5">
        {drafts.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <select
              value={d.categoryId ?? ''}
              onChange={(e) => patchRow(d.key, { categoryId: e.target.value || null })}
              disabled={save.isPending}
              className="flex-1 text-xs rounded px-1.5 py-1
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
            >
              <option value="">-- Non categorisee --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              value={d.amount}
              onChange={(e) => patchRow(d.key, { amount: e.target.value })}
              disabled={save.isPending}
              className="w-24 text-xs tabular-nums rounded px-1.5 py-1
                         border border-gray-300 dark:border-gray-700
                         bg-white dark:bg-gray-900
                         text-gray-900 dark:text-gray-100
                         focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
            />
            <button
              onClick={() => removeRow(d.key)}
              disabled={save.isPending || drafts.length <= 1}
              className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none px-1"
              title={drafts.length <= 1 ? 'Au moins un split est requis' : 'Retirer cette ligne'}
              aria-label="Retirer"
            >
              &times;
            </button>
          </li>
        ))}
      </ul>

      <button
        onClick={addRow}
        disabled={save.isPending}
        className="mt-2 text-xs text-cat-teal-fg hover:underline"
      >
        + Ajouter une catégorie
      </button>

      <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 text-xs">
        <div className="tabular-nums">
          <span className="text-gray-500 dark:text-gray-400">Total : </span>
          <span className={balanced ? 'text-cat-green-fg font-medium' : 'text-cat-red-fg font-medium'}>
            {currentSum.toFixed(2)}
          </span>
          <span className="text-gray-500 dark:text-gray-400"> / {parentAbs.toFixed(2)}</span>
          {!balanced && (
            <span className="ml-2 text-cat-red-fg italic">
              reste {remaining.toFixed(2)} $ à répartir
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDone}
            disabled={save.isPending}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Annuler
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            className="px-3 py-1 rounded bg-cat-teal-fg text-white
                       disabled:bg-gray-300 dark:disabled:bg-gray-700
                       disabled:text-gray-500 disabled:cursor-not-allowed
                       hover:brightness-110 transition"
          >
            {save.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}
    </div>
  );
}

/**
 * Ligne "Prévu" : item budgétaire attendu à cette date mais pas encore
 * réconcilié avec une transaction. Rendu en italique + bordure dashed pour
 * matcher le style des ghosts sur le calendrier.
 */
function GhostItem({ ghost }: { ghost: PlannedGhost }) {
  const color = ghost.categoryColor ?? 'gray';
  const isIncome = ghost.direction === 'INCOME';
  const sign = isIncome ? '+' : '-';
  return (
    <li className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition">
      <span
        className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium shrink-0 border-2 border-dashed border-cat-${color} bg-cat-${color}-bg/60 text-cat-${color}-fg dark:bg-cat-${color}/15 dark:text-cat-${color}`}
        title="Prévu — pas encore réalisé"
      >
        {ghost.name[0]?.toUpperCase() ?? '?'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate text-gray-900 dark:text-gray-100 font-medium italic">
          {ghost.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-1.5 items-center">
          <span>Prévu</span>
          <span className="text-gray-300 dark:text-gray-600">&middot;</span>
          <span>{ghost.categoryName}</span>
        </div>
      </div>
      <div
        className={`text-sm tabular-nums font-medium italic ${
          isIncome ? 'text-cat-green-fg dark:text-cat-green' : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {sign}
        {formatCurrency(ghost.plannedAmount, true)}
      </div>
    </li>
  );
}

/** Solde net prévu pour un ensemble d'occurrences (revenus - dépenses). */
function plannedNet(ghosts: PlannedGhost[]): number {
  return ghosts.reduce(
    (sum, g) =>
      sum + (g.direction === 'INCOME' ? 1 : -1) * Number(g.plannedAmount),
    0,
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
