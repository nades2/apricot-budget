import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, Category, CsvImport, MappingSource, PreviewRow } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

type Filter = 'all' | 'uncategorized' | 'errors';

/**
 * L override utilisateur + le flag "apprendre" pour chaque ligne.
 * Seuls les rowIndex avec un changement sont envoyes au /confirm.
 */
type Override = { categoryId?: string; saveAsRule?: boolean };

export function StepMapping({
  csvImport,
  onConfirmed,
  onCancel,
}: {
  csvImport: CsvImport;
  onConfirmed: (updated: CsvImport) => void;
  onCancel: () => void;
}) {
  const { data: preview } = useQuery({
    queryKey: ['csv-import', csvImport.id],
    queryFn: () => api.get<CsvImport>(`/csv-imports/${csvImport.id}`),
    initialData: csvImport,
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [filter, setFilter] = useState<Filter>('all');

  const rows: PreviewRow[] = preview?.rawPayload ?? [];

  const filteredRows = useMemo(() => {
    switch (filter) {
      case 'uncategorized':
        return rows.filter(
          (r) => !r.informational && !r.suggestion.suggestedCategoryId && !overrides[r.rowIndex]?.categoryId,
        );
      case 'errors':
        return rows.filter((r) => !!r.parseError);
      default:
        return rows;
    }
  }, [rows, filter, overrides]);

  const stats = useMemo(() => {
    let categorized = 0;
    let uncategorized = 0;
    let informational = 0;
    let errored = 0;
    for (const r of rows) {
      if (r.parseError) errored++;
      else if (r.informational) informational++;
      else if (overrides[r.rowIndex]?.categoryId || r.suggestion.suggestedCategoryId) categorized++;
      else uncategorized++;
    }
    return { categorized, uncategorized, informational, errored };
  }, [rows, overrides]);

  const confirm = useMutation({
    mutationFn: () => {
      const mappings = Object.entries(overrides)
        .filter(([, v]) => v.categoryId !== undefined || v.saveAsRule)
        .map(([rowIndex, v]) => ({ rowIndex: Number(rowIndex), ...v }));
      return api.post<CsvImport>(`/csv-imports/${csvImport.id}/confirm`, { mappings });
    },
    onSuccess: onConfirmed,
  });

  function setCategory(rowIndex: number, categoryId: string | undefined) {
    setOverrides((prev) => ({ ...prev, [rowIndex]: { ...prev[rowIndex], categoryId } }));
  }
  function toggleRule(rowIndex: number) {
    setOverrides((prev) => ({
      ...prev,
      [rowIndex]: { ...prev[rowIndex], saveAsRule: !prev[rowIndex]?.saveAsRule },
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center text-sm">
        <StatChip label="Mappees" value={stats.categorized} color="green" />
        <StatChip label="Non categorisees" value={stats.uncategorized} color="amber" />
        <StatChip label="Informationnelles" value={stats.informational} color="gray" />
        {stats.errored > 0 && <StatChip label="Erreurs" value={stats.errored} color="red" />}

        <div className="ml-auto flex gap-1 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden text-xs">
          <FilterBtn value="all" current={filter} onClick={setFilter} label="Toutes" />
          <FilterBtn value="uncategorized" current={filter} onClick={setFilter} label="A mapper" />
          {stats.errored > 0 && (
            <FilterBtn value="errors" current={filter} onClick={setFilter} label="Erreurs" />
          )}
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-gray-950">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-800">
              <tr className="text-xs text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                <th className="text-left px-3 py-2.5 font-semibold">Date</th>
                <th className="text-left px-3 py-2.5 font-semibold">Description</th>
                <th className="text-right px-3 py-2.5 font-semibold">Montant</th>
                <th className="text-left px-3 py-2.5 font-semibold">Categorie</th>
                <th className="text-center px-3 py-2.5 font-semibold">Apprendre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {filteredRows.map((r) => (
                <MappingRow
                  key={r.rowIndex}
                  row={r}
                  categories={categories ?? []}
                  override={overrides[r.rowIndex]}
                  onSetCategory={(id) => setCategory(r.rowIndex, id)}
                  onToggleRule={() => toggleRule(r.rowIndex)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirm.error && (
        <p className="text-sm text-cat-red-fg dark:text-cat-red bg-cat-red-bg dark:bg-cat-red/15 rounded-md px-3 py-2">
          {(confirm.error as Error).message}
        </p>
      )}

      <div className="flex justify-between items-center">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          &larr; Annuler
        </button>
        <button
          onClick={() => confirm.mutate()}
          disabled={confirm.isPending}
          className="px-4 py-2 bg-cat-teal-fg text-white rounded-md text-sm font-medium disabled:opacity-40 hover:bg-cat-teal-fg/90"
        >
          {confirm.isPending ? 'Confirmation...' : `Confirmer et importer ${stats.categorized + stats.uncategorized} transactions ->`}
        </button>
      </div>
    </div>
  );
}

function MappingRow({
  row,
  categories,
  override,
  onSetCategory,
  onToggleRule,
}: {
  row: PreviewRow;
  categories: Category[];
  override?: Override;
  onSetCategory: (id: string | undefined) => void;
  onToggleRule: () => void;
}) {
  const amt = Number(row.amount);
  const isCredit = amt > 0;
  const effectiveCategoryId = override?.categoryId ?? row.suggestion.suggestedCategoryId ?? '';
  const dim = row.informational || !!row.parseError;

  return (
    <tr className={`hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors ${dim ? 'opacity-60' : ''}`}>
      {/* Date : neutre, tabulaire, plus discret que la description */}
      <td className="px-3 py-2.5 text-gray-500 dark:text-gray-400 tabular-nums whitespace-nowrap">
        {row.postedAt}
      </td>

      {/* Description : contraste MAX — c est l info principale a l ecran.
          gray-900 en clair, gray-100 en sombre = presque noir/blanc pur. */}
      <td className="px-3 py-2.5 min-w-0">
        <div
          className="truncate max-w-[280px] text-gray-900 dark:text-gray-100 font-medium"
          title={row.description}
        >
          {row.description}
        </div>
        {row.parseError && (
          <div className="text-xs text-cat-red-fg dark:text-cat-red mt-0.5">! {row.parseError}</div>
        )}
        {row.informational && (
          <div className="text-xs text-gray-400 dark:text-gray-500 italic mt-0.5">
            informationnelle
          </div>
        )}
      </td>

      {/* Montant : credits en vert, debits en couleur du texte principal
          (pas de gris-800 qui devient invisible en dark) */}
      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold whitespace-nowrap ${
        isCredit
          ? 'text-cat-green-fg dark:text-cat-green'
          : 'text-gray-900 dark:text-gray-100'
      }`}>
        {isCredit ? '+' : ''}{formatCurrency(row.amount, true)}
      </td>

      {/* Categorie : dropdown avec styles dark propres */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <select
            value={effectiveCategoryId}
            onChange={(e) => onSetCategory(e.target.value || undefined)}
            disabled={dim}
            className="border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs
                       bg-white dark:bg-gray-900
                       text-gray-900 dark:text-gray-100
                       disabled:opacity-50
                       min-w-[160px] focus:outline-none focus:ring-1 focus:ring-cat-teal-fg"
          >
            <option value="">-- Aucune --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <SourceBadge
            source={row.suggestion.source}
            confidence={row.suggestion.confidence}
            overridden={!!override?.categoryId}
          />
        </div>
      </td>

      {/* Apprendre : checkbox accent-teal pour un vrai indicateur visuel */}
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={!!override?.saveAsRule}
          onChange={onToggleRule}
          disabled={dim || !effectiveCategoryId}
          className="w-4 h-4 accent-cat-teal-fg cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title="Creer une regle pour auto-mapper ce libelle aux prochains imports"
        />
      </td>
    </tr>
  );
}

function SourceBadge({
  source,
  confidence,
  overridden,
}: {
  source: MappingSource;
  confidence: number;
  overridden: boolean;
}) {
  if (overridden) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded bg-cat-purple-bg text-cat-purple-fg font-medium">
        manuel
      </span>
    );
  }

  const label: Record<MappingSource, string> = {
    user_rule: 'regle',
    bank_category: 'BNC',
    similar_history: 'similaire',
    none: '-',
  };
  const cls: Record<MappingSource, string> = {
    user_rule: 'bg-cat-green-bg text-cat-green-fg',
    bank_category: 'bg-cat-teal-bg text-cat-teal-fg',
    similar_history: 'bg-cat-blue-bg text-cat-blue-fg',
    none: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  };
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls[source]}`}
      title={`Confiance ${(confidence * 100).toFixed(0)}%`}
    >
      {label[source]}
    </span>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-cat-${color}-bg text-cat-${color}-fg`}>
      <b className="tabular-nums">{value}</b>
      <span>{label}</span>
    </span>
  );
}

function FilterBtn({
  value,
  current,
  onClick,
  label,
}: {
  value: Filter;
  current: Filter;
  onClick: (f: Filter) => void;
  label: string;
}) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-1 transition ${
        active
          ? 'bg-cat-teal-bg text-cat-teal-fg font-medium'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
      }`}
    >
      {label}
    </button>
  );
}
