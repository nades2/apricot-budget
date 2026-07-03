import { BudgetReport } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

/**
 * The at-a-glance answer to "ce mois a-t-il été positif ou négatif ?"
 * — Prévu, Réel, Écart, verdict coloré.
 */
export function VerdictBanner({ report }: { report: BudgetReport }) {
  const netActual = Number(report.net.actual);
  const netPlanned = Number(report.net.planned);
  const variance = Number(report.net.variance);

  const verdict = report.net.verdict;
  const bg = verdict === 'positive' ? 'bg-cat-green-bg' : verdict === 'negative' ? 'bg-cat-red-bg' : 'bg-gray-100 dark:bg-gray-800';
  const fg = verdict === 'positive' ? 'text-cat-green-fg' : verdict === 'negative' ? 'text-cat-red-fg' : 'text-gray-600 dark:text-gray-400';
  const label = verdict === 'positive' ? 'Positif' : verdict === 'negative' ? 'Négatif' : 'Neutre';
  const icon = verdict === 'positive' ? '↑' : verdict === 'negative' ? '↓' : '=';

  return (
    <div className={`${bg} border border-transparent rounded-xl p-5 flex items-center justify-between gap-6 flex-wrap`}>
      <div>
        <div className={`text-xs font-medium uppercase tracking-wide ${fg}`}>Résultat du mois</div>
        <div className={`text-3xl font-semibold mt-1 ${fg}`}>
          <span className="mr-2">{icon}</span>
          {formatCurrency(netActual, true)}
        </div>
        <div className={`text-sm mt-0.5 ${fg}`}>
          {label}
          {variance !== 0 && (
            <span className="ml-2 text-gray-500 dark:text-gray-400">
              (écart vs. prévu : <b>{variance >= 0 ? '+' : ''}{formatCurrency(variance, true)}</b>)
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-6 text-sm">
        <MiniStat label="Revenus prévus"  value={report.income.planned}  actual={report.income.actual}  positive />
        <MiniStat label="Dépenses prévues" value={report.expense.planned} actual={report.expense.actual} />
        <MiniStat label="Solde prévu"     value={report.net.planned}     actual={report.net.actual}     alt={netPlanned >= 0} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, actual, positive, alt }: { label: string; value: string; actual: string; positive?: boolean; alt?: boolean }) {
  return (
    <div className="min-w-[110px]">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-base font-medium mt-0.5 tabular-nums ${positive ? 'text-cat-green-fg' : alt !== undefined ? (alt ? 'text-cat-green-fg' : 'text-cat-red-fg') : 'text-gray-800 dark:text-gray-200'}`}>
        {formatCurrency(value, true)}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
        réel : <b>{formatCurrency(actual, true)}</b>
      </div>
    </div>
  );
}
