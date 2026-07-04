import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Account, ForecastResponse, api } from '../lib/api';
import { formatCurrency, isoToday } from '../lib/format';
import { CashflowChart } from '../components/Forecast/CashflowChart';
import { ScenarioPanel } from '../components/Forecast/ScenarioPanel';
import { AlertsBanner } from '../components/Forecast/AlertsBanner';
import { Hypothesis, recomputeTimeline, scenarioDelta } from '../lib/scenario';

type Horizon = 30 | 90 | 180 | 365;

const HORIZONS: Horizon[] = [30, 90, 180, 365];

/**
 * Prevision de tresorerie : selectionne un compte, un horizon (1 a 12 mois),
 * un seuil bas optionnel, puis affiche la courbe de solde projete + les
 * jours "a risque" ou le solde passe sous le seuil.
 *
 * Depuis v2 : atelier what-if — l utilisateur ajoute des transactions
 * fictives et voit la courbe scenario en pointille violet.
 */
export function ForecastPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<Horizon>(90);
  const [threshold, setThreshold] = useState<string>('0');

  // Scenarios what-if — state local uniquement, jamais persiste.
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [showOverlay, setShowOverlay] = useState(true);

  const today = isoToday();
  const toIso = useMemo(() => shiftIso(today, horizon), [today, horizon]);

  const { data: accounts } = useQuery({
    queryKey: ['accounts', 'all'],
    queryFn: () => api.get<Account[]>('/accounts'),
  });

  const activeId = accountId ?? accounts?.[0]?.id ?? null;

  const { data: forecast, isLoading, error } = useQuery({
    queryKey: ['forecast', activeId, today, toIso, threshold],
    queryFn: () => {
      const qs = new URLSearchParams({ from: today, to: toIso });
      if (threshold) qs.set('lowBalanceThreshold', threshold);
      return api.get<ForecastResponse>(`/forecast/${activeId}?${qs.toString()}`);
    },
    enabled: !!activeId,
  });

  const scenarioDays = useMemo(() => {
    if (!forecast) return null;
    return recomputeTimeline(forecast, hypotheses);
  }, [forecast, hypotheses]);

  const activeDays = showOverlay && scenarioDays && hypotheses.length > 0
    ? scenarioDays
    : forecast?.days ?? [];
  const daysBelow = activeDays.filter((d) => d.belowThreshold);
  const firstBelow = daysBelow[0];

  const delta = forecast && scenarioDays ? scenarioDelta(forecast, scenarioDays) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-end justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold leading-tight">Prevision de tresorerie</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Solde projete sur {horizon} jours a partir des depenses/revenus recurrents planifies.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Compte&nbsp;
            <select
              value={activeId ?? ''}
              onChange={(e) => setAccountId(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1"
            >
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>

          <HorizonToggle value={horizon} onChange={setHorizon} />

          <label className="text-xs text-gray-500 dark:text-gray-400">
            Seuil bas&nbsp;
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-24 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded px-2 py-1"
              step="50"
            />
          </label>
        </div>
      </header>

      <AlertsBanner />

      {isLoading && <p className="text-sm text-gray-500">Chargement...</p>}
      {error && <p className="text-sm text-red-600">Erreur : {(error as Error).message}</p>}

      {forecast && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Stat label="Solde d ouverture" value={forecast.openingBalance} />
            <Stat
              label="Solde projete"
              value={
                showOverlay && hypotheses.length > 0 && scenarioDays
                  ? scenarioDays[scenarioDays.length - 1].balance
                  : forecast.closingBalance
              }
              accent={
                Number(showOverlay && hypotheses.length > 0 && scenarioDays
                  ? scenarioDays[scenarioDays.length - 1].balance
                  : forecast.closingBalance) < Number(threshold || 0) ? 'red' : 'green'
              }
              hint={
                hypotheses.length > 0
                  ? `${delta >= 0 ? '+' : ''}${formatCurrency(delta, true)} vs baseline`
                  : undefined
              }
            />
            <Stat
              label="Jours sous seuil"
              value={String(daysBelow.length)}
              accent={daysBelow.length > 0 ? 'red' : 'neutral'}
              raw
            />
            <Stat
              label="Premier jour a risque"
              value={firstBelow?.date ?? '-'}
              accent={firstBelow ? 'red' : 'neutral'}
              raw
            />
          </div>

          {/* Panel scenarios what-if */}
          <ScenarioPanel
            hypotheses={hypotheses}
            windowFrom={forecast.from}
            windowTo={forecast.to}
            showOverlay={showOverlay}
            onToggleOverlay={setShowOverlay}
            onAdd={(h) => setHypotheses((prev) => [...prev, { ...h, id: cryptoRandomId() }])}
            onRemove={(id) => setHypotheses((prev) => prev.filter((h) => h.id !== id))}
            onClear={() => setHypotheses([])}
          />

          {/* Chart */}
          <section className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900 mb-4">
            <header className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                Solde projete
              </h2>
              <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-3 h-0.5"
                    style={{ background: 'var(--chart-baseline)' }}
                  />
                  Baseline
                </span>
                {showOverlay && hypotheses.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-3 h-0.5"
                      style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--chart-scenario) 0 3px, transparent 3px 6px)' }}
                    />
                    Scenario
                  </span>
                )}
                {forecast.lowBalanceThreshold != null && (
                  <span className="flex items-center gap-1">
                    <span
                      className="inline-block w-3 h-0.5"
                      style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--chart-threshold) 0 4px, transparent 4px 7px)' }}
                    />
                    Seuil
                  </span>
                )}
              </div>
            </header>

            <CashflowChart
              days={forecast.days}
              overlayDays={showOverlay && hypotheses.length > 0 && scenarioDays ? scenarioDays : undefined}
              threshold={forecast.lowBalanceThreshold != null ? Number(forecast.lowBalanceThreshold) : null}
              todayIso={today}
              height={260}
            />

          </section>

          {/* Occurrences projetees a venir (top 10) */}
          <section>
            <h2 className="text-base font-semibold mb-2.5 text-gray-800 dark:text-gray-100">
              Prochaines occurrences planifiees
            </h2>
            <UpcomingList days={forecast.days} limit={10} />
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = 'neutral',
  raw = false,
  hint,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'red' | 'neutral';
  raw?: boolean;
  hint?: string;
}) {
  const color =
    accent === 'green' ? 'text-cat-green-fg dark:text-cat-green' :
    accent === 'red' ? 'text-cat-red-fg dark:text-cat-red' :
    'text-gray-900 dark:text-gray-100';
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900">
      <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">{label}</div>
      {/* Solde projete = grand nombre → sans cents. formatCurrency(detailed=false)
          arrondit a l entier, ce qui rend le KPI plus lisible d un coup d oeil. */}
      <div className={`text-2xl md:text-3xl font-bold mt-1.5 tabular-nums leading-tight ${color}`}>
        {raw ? value : formatCurrency(value)}
      </div>
      {hint && (
        <div
          className="text-[11px] mt-1 tabular-nums font-medium"
          style={{ color: 'var(--scenario-fg)' }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function HorizonToggle({ value, onChange }: { value: Horizon; onChange: (h: Horizon) => void }) {
  return (
    <div className="inline-flex border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden text-xs">
      {HORIZONS.map((h) => (
        <button
          key={h}
          onClick={() => onChange(h)}
          className={`px-3 py-1 ${
            value === h
              ? 'bg-cat-teal-bg text-cat-teal-fg font-medium'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          {h} j
        </button>
      ))}
    </div>
  );
}

function UpcomingList({ days, limit }: { days: import('../lib/api').ForecastDay[]; limit: number }) {
  const rows: Array<{ date: string; name: string; amount: string; direction: string }> = [];
  for (const day of days) {
    for (const e of day.entries) {
      if (e.status !== 'PROJECTED') continue;
      rows.push({ date: day.date, name: e.name, amount: e.amount, direction: e.direction });
      if (rows.length >= limit) break;
    }
    if (rows.length >= limit) break;
  }
  if (rows.length === 0) {
    return <p className="text-xs text-gray-500">Aucune occurrence projetee dans la fenetre.</p>;
  }
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-950/60 text-[11px] uppercase tracking-widest text-gray-500 dark:text-gray-400 font-bold">
          <tr>
            <th className="text-left px-4 py-2.5">Date</th>
            <th className="text-left px-4 py-2.5">Nom</th>
            <th className="text-right px-4 py-2.5">Montant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition"
            >
              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 tabular-nums">{r.date}</td>
              <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100">{r.name}</td>
              <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                r.direction === 'INCOME'
                  ? 'text-cat-green-fg dark:text-cat-green'
                  : 'text-cat-red-fg dark:text-cat-red'
              }`}>
                {r.direction === 'INCOME' ? '+' : ''}{formatCurrency(r.amount, true)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function cryptoRandomId(): string {
  // Preferer crypto.randomUUID quand dispo (tous les navigateurs modernes le supportent).
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
