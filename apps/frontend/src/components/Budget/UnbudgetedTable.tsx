import { UnbudgetedLine } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

/**
 * Table "Hors budget" — même mise en page que BudgetLineTable mais sans les
 * colonnes Prévu / Progression puisqu'il n'y a pas de plan par définition.
 * Affiche les catégories qui ont eu des transactions ce mois-ci mais aucun
 * BudgetItem, plus une row synthétique "Non catégorisées" pour les
 * transactions sans categoryId.
 *
 * Variantes :
 *   - `EXPENSE` / `INCOME` — sections classiques "Hors budget", rouge/vert.
 *   - `STAGING` — section "À reclasser", ambre (action requise) : les
 *     transactions dans une catégorie fourre-tout comme "Remboursement" qui
 *     ne sont ni des dépenses ni des revenus tant que non requalifiées.
 *
 * Rendu conditionnel : si aucune ligne, on n'affiche pas la section (silence
 * budgétaire = tout est budgeté, bonne nouvelle).
 */
type UnbudgetedTableVariant = 'EXPENSE' | 'INCOME' | 'STAGING';

export function UnbudgetedTable({
  title,
  lines,
  total,
  direction,
  onRowClick,
}: {
  title: string;
  lines: UnbudgetedLine[];
  total: string;
  direction: UnbudgetedTableVariant;
  /** Ouvre le modal détail — appelé avec la line sélectionnée. */
  onRowClick?: (line: UnbudgetedLine) => void;
}) {
  if (lines.length === 0) return null;

  const totalColorClass =
    direction === 'EXPENSE'
      ? 'text-cat-red-fg dark:text-cat-red'
      : direction === 'INCOME'
        ? 'text-cat-green-fg dark:text-cat-green'
        : 'text-cat-amber-fg dark:text-cat-amber';

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          Total{' '}
          <b className={totalColorClass}>{formatCurrency(total, true)}</b>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/40">
            <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-normal">Catégorie</th>
              <th className="text-right px-3 py-2 font-normal">Transactions</th>
              <th className="text-right px-3 py-2 font-normal">Réel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {lines.map((l, i) => (
              <Row
                key={l.categoryId ?? `uncat-${i}`}
                line={l}
                direction={direction}
                onClick={onRowClick}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({
  line,
  direction,
  onClick,
}: {
  line: UnbudgetedLine;
  direction: UnbudgetedTableVariant;
  onClick?: (line: UnbudgetedLine) => void;
}) {
  const color = line.categoryColor ?? 'gray';
  const isUncategorized = line.categoryId === null;
  const clickable = !!onClick;
  const amountColorClass =
    direction === 'EXPENSE'
      ? 'text-cat-red-fg dark:text-cat-red'
      : direction === 'INCOME'
        ? 'text-cat-green-fg dark:text-cat-green'
        : 'text-cat-amber-fg dark:text-cat-amber';

  return (
    <tr
      onClick={clickable ? () => onClick!(line) : undefined}
      className={`dark:bg-gray-800/40 ${
        clickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 group' : ''
      }`}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs bg-cat-${color}-bg text-cat-${color}-fg ${
              isUncategorized ? 'italic' : ''
            }`}
          >
            {line.categoryName}
          </span>
          {clickable && (
            <span className="text-gray-300 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-300 text-xs">
              →
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
        {line.count}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${amountColorClass}`}>
        {formatCurrency(line.actual, true)}
      </td>
    </tr>
  );
}
