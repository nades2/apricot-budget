import { UnbudgetedLine } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

/**
 * Table "Hors budget" — même mise en page que BudgetLineTable mais sans les
 * colonnes Prévu / Progression puisqu'il n'y a pas de plan par définition.
 * Affiche les catégories qui ont eu des transactions ce mois-ci mais aucun
 * BudgetItem, plus une row synthétique "Non catégorisées" pour les
 * transactions sans categoryId.
 *
 * Rendu conditionnel : si aucune ligne, on n'affiche pas la section (silence
 * budgétaire = tout est budgeté, bonne nouvelle).
 */
export function UnbudgetedTable({
  title,
  lines,
  total,
  direction,
}: {
  title: string;
  lines: UnbudgetedLine[];
  total: string;
  direction: 'EXPENSE' | 'INCOME';
}) {
  if (lines.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
          Total{' '}
          <b className={direction === 'EXPENSE' ? 'text-cat-red-fg' : 'text-cat-green-fg'}>
            {formatCurrency(total, true)}
          </b>
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
              <Row key={l.categoryId ?? `uncat-${i}`} line={l} direction={direction} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ line, direction }: { line: UnbudgetedLine; direction: 'EXPENSE' | 'INCOME' }) {
  const color = line.categoryColor ?? 'gray';
  const isUncategorized = line.categoryId === null;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 dark:bg-gray-800/40">
      <td className="px-3 py-2">
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs bg-cat-${color}-bg text-cat-${color}-fg ${
            isUncategorized ? 'italic' : ''
          }`}
        >
          {line.categoryName}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
        {line.count}
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums font-medium ${
          direction === 'EXPENSE' ? 'text-cat-red-fg' : 'text-cat-green-fg'
        }`}
      >
        {formatCurrency(line.actual, true)}
      </td>
    </tr>
  );
}
