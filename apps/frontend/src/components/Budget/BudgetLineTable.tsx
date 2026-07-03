import { BudgetDirection, BudgetLine } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

/**
 * Grouped list — one for Revenus, one for Dépenses. Each row shows the plan,
 * the real total, and a variance bar. Colors follow the status returned by
 * the backend (`ok` / `over` / `under` / `missing`). Rows are clickable so
 * the user can modify or delete a budget item without leaving the report.
 */
export function BudgetLineTable({
  title,
  lines,
  planned,
  actual,
  direction,
  onEdit,
}: {
  title: string;
  lines: BudgetLine[];
  planned: string;
  actual: string;
  direction: BudgetDirection;
  onEdit?: (itemId: string) => void;
}) {
  if (lines.length === 0) {
    return (
      <section>
        <h2 className="text-base font-semibold mb-2">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 text-center">
          Aucun poste. Ajoute-en avec le bouton "+ Poste".
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          Prévu <b className="text-gray-800 dark:text-gray-100">{formatCurrency(planned, true)}</b> ·
          Réel <b className="text-gray-800 dark:text-gray-100 ml-1">{formatCurrency(actual, true)}</b>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/40">
            <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-normal">Poste</th>
              <th className="text-left px-3 py-2 font-normal">Catégorie</th>
              <th className="text-right px-3 py-2 font-normal">Occurrences</th>
              <th className="text-right px-3 py-2 font-normal">Prévu</th>
              <th className="text-right px-3 py-2 font-normal">Réel</th>
              <th className="text-right px-3 py-2 font-normal">Écart</th>
              <th className="text-left px-3 py-2 font-normal">Progression</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {lines.map((l) => <Row key={l.itemId} line={l} direction={direction} onEdit={onEdit} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ line, direction, onEdit }: { line: BudgetLine; direction: BudgetDirection; onEdit?: (itemId: string) => void }) {
  const planned = Number(line.planned);
  const actual = Number(line.actual);
  const variance = Number(line.variance);
  const ratio = planned > 0 ? Math.min(actual / planned, 1.5) : 0;

  const color = line.categoryColor ?? 'gray';
  const statusColor: Record<BudgetLine['status'], string> = {
    ok: 'cat-green', over: direction === 'EXPENSE' ? 'cat-red' : 'cat-green',
    under: direction === 'EXPENSE' ? 'cat-teal' : 'cat-red',
    missing: 'cat-gray',
  };
  const statusLabel: Record<BudgetLine['status'], string> = {
    ok: 'OK', over: direction === 'EXPENSE' ? 'Dépassé' : 'Bonus',
    under: direction === 'EXPENSE' ? 'Sous budget' : 'Manquant',
    missing: 'Aucune',
  };
  const barColor = statusColor[line.status];

  return (
    <tr
      onClick={onEdit ? () => onEdit(line.itemId) : undefined}
      className={onEdit ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 dark:bg-gray-800/40 group' : ''}
    >
      <td className="px-3 py-2">
        <div className="font-medium flex items-center gap-1.5">
          {line.name}
          {onEdit && <span className="text-gray-300 group-hover:text-gray-500 dark:text-gray-400 text-xs">✎</span>}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {formatCurrency(line.amountPerOccurrence, true)} × {line.occurrences}
        </div>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded text-xs bg-cat-${color}-bg text-cat-${color}-fg`}>
          {line.categoryName}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">{line.occurrences}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(planned, true)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(actual, true)}</td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${
        (direction === 'EXPENSE' ? variance > 0 : variance < 0) ? 'text-cat-red-fg' : 'text-cat-green-fg'
      }`}>
        {variance >= 0 ? '+' : ''}{formatCurrency(variance, true)}
      </td>
      <td className="px-3 py-2 w-[160px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
            <div className={`h-full bg-${barColor}`} style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
          </div>
          <span className={`text-xs bg-${barColor}-bg text-${barColor}-fg px-1.5 py-0.5 rounded whitespace-nowrap`}>
            {statusLabel[line.status]}
          </span>
        </div>
      </td>
    </tr>
  );
}
