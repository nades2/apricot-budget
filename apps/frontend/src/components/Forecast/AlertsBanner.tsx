import { useQuery } from '@tanstack/react-query';
import { ForecastAlert, api } from '../../lib/api';
import { formatCurrency } from '../../lib/format';

/**
 * Bandeau d alertes J-7 — affiche jusqu a 3 alertes du plus urgent au moins
 * urgent. Se cache silencieusement s il n y a rien a signaler.
 *
 * L API cote backend n a pas de persistance : chaque affichage du bandeau
 * declenche un scan a la volee. C est acceptable a l echelle familiale
 * (< 100 ms) et evite de gerer un cron.
 */
export function AlertsBanner() {
  const { data: alerts } = useQuery({
    queryKey: ['forecast-alerts'],
    queryFn: () => api.get<ForecastAlert[]>('/forecast/alerts'),
    refetchInterval: 5 * 60_000,   // rafraichi toutes les 5 min
  });

  if (!alerts || alerts.length === 0) return null;

  const top = alerts.slice(0, 3);

  return (
    <div className="mb-4 space-y-2">
      {top.map((a) => (
        <div
          key={a.accountId}
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
            a.severity === 'imminent'
              ? 'bg-cat-red-bg/40 border-cat-red-fg/30 text-cat-red-fg'
              : a.severity === 'soon'
              ? 'bg-cat-yellow-bg/40 border-cat-yellow-fg/30 text-cat-yellow-fg'
              : 'bg-cat-teal-bg/30 border-cat-teal-fg/20 text-cat-teal-fg'
          }`}
        >
          <i
            className={`ti ${
              a.severity === 'imminent' ? 'ti-alert-triangle' : 'ti-alert-circle'
            } text-lg shrink-0 mt-0.5`}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-medium">
              {a.accountName} — solde sous le seuil dans {a.daysUntil} jour{a.daysUntil > 1 ? 's' : ''}
            </div>
            <div className="text-xs opacity-90 mt-0.5">
              Le {a.firstBelowDate}, solde projete{' '}
              <b>{formatCurrency(a.projectedBalance, true)}</b>{' '}
              (seuil {formatCurrency(a.lowBalanceThreshold, true)}).
            </div>
          </div>
        </div>
      ))}
      {alerts.length > top.length && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 pl-1">
          + {alerts.length - top.length} autre{alerts.length - top.length > 1 ? 's' : ''} alerte{alerts.length - top.length > 1 ? 's' : ''}...
        </p>
      )}
    </div>
  );
}
