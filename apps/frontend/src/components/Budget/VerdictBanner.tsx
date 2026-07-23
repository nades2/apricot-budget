import { BudgetReport } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

/**
 * The at-a-glance answer to "ce mois a-t-il été positif ou négatif ?"
 * — Prévu, Réel, Écart, verdict coloré.
 *
 * Distinction importante :
 *   - `actual`      = scope BUDGÉTÉ seulement (ce qui a matché un BudgetItem).
 *                     Utile pour "as-tu respecté ton plan?".
 *   - `actualTotal` = actual + hors budget. Vrai cashflow du mois. Utile pour
 *                     "quel est mon vrai résultat?". C'est ce que le user
 *                     interprète naturellement comme "résultat du mois", donc
 *                     c'est cette valeur qui pilote le gros chiffre et le
 *                     verdict coloré.
 *
 * Les remboursements classés dans une catégorie DÉPENSE (ex. remboursement
 * physio dans Santé) sont maintenant nettés au niveau du poste par le
 * backend (Phase 6.2 fix), donc `actual` reflète le net dépensé propre.
 *
 * Dark mode : les backgrounds colorés (bg-cat-*-bg) sont pales, conçus pour
 * du texte foncé. En dark mode on inverse — background tinté de la couleur
 * accent à 10% d'opacité sur le fond sombre, et texte dans la version bright
 * de la couleur (cat-green au lieu de cat-green-fg). Cf. WCAG AA contrast.
 */
export function VerdictBanner({ report }: { report: BudgetReport }) {
  const netActualTotal = Number(report.net.actualTotal);
  const netPlanned = Number(report.net.planned);
  const varianceTotal = Number(report.net.varianceTotal);

  const verdict = report.net.verdictTotal;

  // Backgrounds : pale (cat-*-bg) en light, tinté /15 sur fond sombre.
  // Les variantes /15 sont safelistées explicitement dans tailwind.config.js.
  const bg =
    verdict === 'positive'
      ? 'bg-cat-green-bg dark:bg-cat-green/15'
      : verdict === 'negative'
        ? 'bg-cat-red-bg dark:bg-cat-red/15'
        : 'bg-gray-100 dark:bg-gray-800';

  // Foreground pour titre + gros chiffre : sombre (cat-*-fg) en light,
  // vif (cat-*) en dark. Ces deux variantes sont safelistées.
  const fg =
    verdict === 'positive'
      ? 'text-cat-green-fg dark:text-cat-green'
      : verdict === 'negative'
        ? 'text-cat-red-fg dark:text-cat-red'
        : 'text-gray-700 dark:text-gray-200';

  const label = verdict === 'positive' ? 'Positif' : verdict === 'negative' ? 'Négatif' : 'Neutre';
  const icon = verdict === 'positive' ? '↑' : verdict === 'negative' ? '↓' : '=';

  const unbudgetedIncome = Number(report.unbudgetedIncome.total);
  const unbudgetedExpense = Number(report.unbudgetedExpense.total);

  return (
    <div className={`${bg} border border-transparent rounded-xl p-5 flex items-center justify-between gap-6 flex-wrap`}>
      <div>
        <div className={`text-xs font-medium uppercase tracking-wide ${fg}`}>Résultat du mois</div>
        <div className={`text-3xl font-semibold mt-1 ${fg}`}>
          <span className="mr-2">{icon}</span>
          {formatCurrency(netActualTotal, true)}
        </div>
        <div className={`text-sm mt-0.5 ${fg}`}>
          {label}
          {varianceTotal !== 0 && (
            <span className="ml-2 text-gray-600 dark:text-gray-400">
              (écart vs. prévu : <b>{varianceTotal >= 0 ? '+' : ''}{formatCurrency(varianceTotal, true)}</b>)
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-6 text-sm">
        <MiniStat
          label="Revenus prévus"
          planned={report.income.planned}
          actualBudgeted={report.income.actual}
          actualTotal={report.income.actualTotal}
          unbudgeted={unbudgetedIncome}
          positive
        />
        <MiniStat
          label="Dépenses prévues"
          planned={report.expense.planned}
          actualBudgeted={report.expense.actual}
          actualTotal={report.expense.actualTotal}
          unbudgeted={unbudgetedExpense}
        />
        <MiniStat
          label="Solde prévu"
          planned={report.net.planned}
          actualBudgeted={report.net.actual}
          actualTotal={report.net.actualTotal}
          alt={netPlanned >= 0}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  planned,
  actualBudgeted,
  actualTotal,
  unbudgeted,
  positive,
  alt,
}: {
  label: string;
  planned: string;
  /** Réel scope budgété — utilisé pour révéler la décomposition si hors budget > 0. */
  actualBudgeted: string;
  /** Réel total (budgété + hors budget). Affiché comme la valeur "réel : X" principale. */
  actualTotal: string;
  /** Total des lignes hors budget (>= 0). Affiché en sous-ligne si non nul. */
  unbudgeted?: number;
  positive?: boolean;
  alt?: boolean;
}) {
  const hasUnbudgeted = unbudgeted !== undefined && unbudgeted > 0;

  // Couleur de la valeur "planned" en fonction du sens :
  //   - positive (revenus) → vert
  //   - alt=true  (solde >= 0 prévu) → vert ; alt=false → rouge
  //   - sinon (dépenses) → couleur neutre (gray)
  // On ajoute systématiquement dark: pour être lisible sur le banner sombre.
  const plannedColor = positive
    ? 'text-cat-green-fg dark:text-cat-green'
    : alt !== undefined
      ? alt
        ? 'text-cat-green-fg dark:text-cat-green'
        : 'text-cat-red-fg dark:text-cat-red'
      : 'text-gray-800 dark:text-gray-100';

  return (
    <div className="min-w-[130px]">
      <div className="text-xs text-gray-600 dark:text-gray-300">{label}</div>
      <div className={`text-base font-medium mt-0.5 tabular-nums ${plannedColor}`}>
        {formatCurrency(planned, true)}
      </div>
      <div className="text-xs text-gray-600 dark:text-gray-300 tabular-nums">
        réel : <b className="text-gray-800 dark:text-gray-100">{formatCurrency(actualTotal, true)}</b>
      </div>
      {hasUnbudgeted && (
        <div className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums leading-tight mt-0.5">
          budget {formatCurrency(actualBudgeted, true)} + hors {formatCurrency(unbudgeted, true)}
        </div>
      )}
    </div>
  );
}
