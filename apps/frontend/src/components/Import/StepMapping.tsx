import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, Category, CsvImport, MappingSource, PreviewRow } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

type Filter = 'all' | 'uncategorized' | 'errors';

/**
 * The user's overrides + rule-learning flags for each row.
 * Only entries where the user changed something get sent to the confirm endpoint.
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
  // Re-fetch the preview to always have the freshest raw_payload (in case Vite HMR
  // reloaded and we lost the initial upload response's rawPayload).
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
        <StatChip label="Mappées" value={stats.categorized} color="green" />
        <StatChip label="Non catégorisées" value={stats.uncategorized} color="amber" />
        <StatChip label="Informationnelles" value={stats.informational} color="gray" />
        {stats.errored > 0 && <StatChip label="Erreurs" value={stats.errored} color="red" />}

        <div className="ml-auto flex gap-1 border border-gray-200 rounded-md overflow-hidden text-xs">
          <FilterBtn value="all" current={filter} onClick={setFilter} label="Toutes" />
          <FilterBtn value="uncategorized" current={filter} onClick={setFilter} label="À mapper" />
          {stats.errored > 0 && (
            <FilterBtn value="errors" current={filter} onClick={setFilter} label="Erreurs" />
          )}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-3 py-2 font-normal">Date</th>
                <th className="text-left px-3 py-2 font-normal">Description</th>
                <th className="text-right px-3 py-2 font-normal">Montant</th>
                <th className="text-left px-3 py-2 font-normal">Catégorie</th>
                <th className="text-center px-3 py-2 font-normal">Apprendre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
        <p className="text-sm text-cat-red-fg bg-cat-red-bg rounded-md px-3 py-2">
          {(confirm.error as Error).message}
        </p>
      )}

      <div className="flex justify-between items-center">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
        >
          ← Annuler
        </button>
        <button
          onClick={() => confirm.mutate()}
          disabled={confirm.isPending}
          className="px-4 py-2 bg-cat-teal-fg text-white rounded-md text-sm font-medium disabled:opacity-40 hover:bg-cat-teal-fg/90"
        >
          {confirm.isPending ? 'Confirmation…' : `Confirmer et importer ${stats.categorized + stats.uncategorized} transactions →`}
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
    <tr className={dim ? 'opacity-50' : ''}>
      <td className="px-3 py-2 text-gray-600 tabular-nums whitespace-nowrap">{row.postedAt}</td>
      <td className="px-3 py-2 min-w-0">
        <div className="truncate max-w-[240px]" title={row.description}>{row.description}</div>
        {row.parseError && <div className="text-xs text-cat-red-fg">⚠ {row.parseError}</div>}
        {row.informational && <div className="text-xs text-gray-400 italic">informationnelle</div>}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap ${
        isCredit ? 'text-cat-green-fg' : 'text-gray-800'
      }`}>
        {isCredit ? '+' : ''}{formatCurrency(row.amount, true)}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <select
            value={effectiveCategoryId}
            onChange={(e) => onSetCategory(e.target.value || undefined)}
            disabled={dim}
            className="border border-gray-300 rounded px-2 py-1 text-xs bg-white min-w-[160px]"
          >
            <option value="">— Aucune —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <SourceBadge source={row.suggestion.source} confidence={row.suggestion.confidence} overridden={!!override?.categoryId} />
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <input
          type="checkbox"
          checked={!!override?.saveAsRule}
          onChange={onToggleRule}
          disabled={dim || !effectiveCategoryId}
          title="Créer une règle pour auto-mapper ce libellé aux prochains imports"
        />
      </td>
    </tr>
  );
}

function SourceBadge({ source, confidence, overridden }: { source: MappingSource; confidence: number; overridden: boolean }) {
  if (overridden) return <span className="text-xs px-1.5 py-0.5 rounded bg-cat-purple-bg text-cat-purple-fg">manuel</span>;

  const label: Record<MappingSource, string> = {
    user_rule: 'règle',
    bank_category: 'BNC',
    similar_history: 'similaire',
    none: '—',
  };
  const cls: Record<MappingSource, string> = {
    user_rule: 'bg-cat-green-bg text-cat-green-fg',
    bank_category: 'bg-cat-teal-bg text-cat-teal-fg',
    similar_history: 'bg-cat-blue-bg text-cat-blue-fg',
    none: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${cls[source]}`} title={`Confiance ${(confidence * 100).toFixed(0)}%`}>
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

function FilterBtn({ value, current, onClick, label }: { value: Filter; current: Filter; onClick: (f: Filter) => void; label: string }) {
  const active = current === value;
  return (
    <button
      onClick={() => onClick(value)}
      className={`px-3 py-1 ${active ? 'bg-cat-teal-bg text-cat-teal-fg font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
    >
      {label}
    </button>
  );
}
