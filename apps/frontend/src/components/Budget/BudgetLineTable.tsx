import { useMemo, useState } from 'react';
import { BudgetDirection, BudgetLine } from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import { BudgetLineDetail } from './BudgetLineDetail';

/**
 * Grouped list — one for Revenus, one for Dépenses. Each row shows the plan,
 * the real total, and a variance bar. Colors follow the status returned by
 * the backend (`ok` / `over` / `under` / `missing`).
 *
 * Interaction :
 *   - Clic sur la row → déplie une vue détaillée listant les transactions
 *     de la catégorie pour le mois affiché, groupées par marchand, avec
 *     reclassification inline.
 *   - Clic sur le bouton ✎ → ouvre le modal d'édition du poste budgétaire.
 *
 * Tri : les postes en dépassement (`over`) apparaissent en haut, suivis des
 * postes sans occurrence (`missing`), puis sous-budget (`under`), puis OK.
 * Tri secondaire par magnitude d'écart décroissante pour EXPENSE, par manque
 * décroissant pour INCOME.
 */
export function BudgetLineTable({
  title,
  lines,
  planned,
  actual,
  direction,
  month,
  onEdit,
}: {
  title: string;
  lines: BudgetLine[];
  planned: string;
  actual: string;
  direction: BudgetDirection;
  /** YYYY-MM courant — passé au détail pour requêter les transactions. */
  month: string;
  onEdit?: (itemId: string) => void;
}) {
  // Tri : dépassé en haut, puis manquant, puis sous-budget, puis OK.
  const sortedLines = useMemo(() => {
    const statusRank: Record<BudgetLine['status'], number> = {
      over: 0,
      missing: 1,
      under: 2,
      ok: 3,
    };
    return [...lines].sort((a, b) => {
      const r = statusRank[a.status] - statusRank[b.status];
      if (r !== 0) return r;
      // Tri secondaire par |écart| DESC pour révéler les plus gros
      // dépassements ou manques en premier.
      return Math.abs(Number(b.variance)) - Math.abs(Number(a.variance));
    });
  }, [lines]);

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
              <th className="text-left px-3 py-2 font-normal w-6"></th>
              <th className="text-left px-3 py-2 font-normal">Poste</th>
              <th className="text-left px-3 py-2 font-normal">Catégorie</th>
              <th className="text-right px-3 py-2 font-normal">Occurrences</th>
              <th className="text-right px-3 py-2 font-normal">Prévu</th>
              <th className="text-right px-3 py-2 font-normal">Réel</th>
              <th className="text-right px-3 py-2 font-normal">Écart</th>
              <th className="text-left px-3 py-2 font-normal">Progression</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {sortedLines.map((l) => (
              <Row
                key={l.itemId}
                line={l}
                direction={direction}
                month={month}
                onEdit={onEdit}
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
  month,
  onEdit,
}: {
  line: BudgetLine;
  direction: BudgetDirection;
  month: string;
  onEdit?: (itemId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const planned = Number(line.planned);
  const actual = Number(line.actual);
  const variance = Number(line.variance);
  // Clamp le ratio à [0, 1.5] — actual peut être négatif quand un poste
  // dépense est sur-remboursé (ex. Santé : 100$ physio − 200$ remboursement
  // = -100$). Sans le max(0, …), la barre aurait une largeur négative.
  const ratio = planned > 0 ? Math.max(0, Math.min(actual / planned, 1.5)) : 0;

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
    <>
      <tr
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 dark:bg-gray-800/40 group"
      >
        <td className="px-3 py-2 text-gray-500 dark:text-gray-300 text-base leading-none w-6">
          {expanded ? '▾' : '▸'}
        </td>
        <td className="px-3 py-2">
          <div className="font-medium">{line.name}</div>
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
          (direction === 'EXPENSE' ? variance > 0 : variance < 0)
            ? 'text-cat-red-fg dark:text-cat-red'
            : 'text-cat-green-fg dark:text-cat-green'
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
        <td className="px-2 py-2 text-right">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(line.itemId);
              }}
              className="text-gray-300 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200 text-sm px-1"
              title="Modifier le poste"
              aria-label="Modifier le poste"
            >
              ✎
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} className="p-0 bg-gray-50/40 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800">
            <BudgetLineDetail
              month={month}
              categoryId={line.categoryId}
              direction={direction}
            />
          </td>
        </tr>
      )}
    </>
  );
}
