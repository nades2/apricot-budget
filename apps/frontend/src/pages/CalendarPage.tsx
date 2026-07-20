import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, CalendarResponse } from '../lib/api';
import { formatCurrency, formatRangeLabel, isoToday } from '../lib/format';
import { CalendarView } from '../components/Calendar/CalendarView';
import { ViewMode } from '../components/Calendar/CalendarCell';
import { DayDetailModal } from '../components/Calendar/DayDetailModal';

/**
 * How many entries we ask the backend to inline per day cell before the rest
 * spill into `overflowItems`. The visible slot count in a cell is bounded by
 * cell height, but we want the modal (and the "+ N autres" tooltip) to know
 * about *everything* planned/spent on that day.
 */
const CELL_TOP_PER_DAY = 20;

/**
 * Deux vues :
 *   - week  : semaine calendrier dimanche → samedi contenant l'anchor
 *   - month : 1er jour → dernier jour du mois contenant l'anchor
 * Le glissement 30j pur a été retiré (2026-07-20) parce que peu utile pour
 * un budget mensuel ancré aux échéances du 1er.
 */
type RangeMode = 'week' | 'month';

/**
 * Calcule la fenêtre calendaire [from, to] pour le mode courant, en se basant
 * sur `anchorIso`. Convention semaine = dimanche à samedi.
 */
function computeRange(anchorIso: string, rangeMode: RangeMode): { from: string; to: string } {
  const anchor = new Date(anchorIso + 'T00:00:00Z');
  if (rangeMode === 'week') {
    const dow = anchor.getUTCDay(); // 0=Sun ... 6=Sat
    const from = new Date(anchor);
    from.setUTCDate(from.getUTCDate() - dow);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 6);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }
  // month
  const from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const to = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * Décale l'anchor d'une période complète (une semaine ou un mois entier).
 * Pour la semaine : ±7 jours. Pour le mois : même jour du mois précédent/suivant,
 * avec clamp sur le dernier jour du mois cible si nécessaire (31 mars → 28 fév).
 */
function shiftAnchor(anchorIso: string, rangeMode: RangeMode, dir: -1 | 1): string {
  const d = new Date(anchorIso + 'T00:00:00Z');
  if (rangeMode === 'week') {
    d.setUTCDate(d.getUTCDate() + 7 * dir);
    return d.toISOString().slice(0, 10);
  }
  // month : cible = 1er jour du mois adjacent, ce qui garantit qu'un clic
  // "précédent" depuis le 31 juillet nous emmène en juin, pas en août.
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1));
  return target.toISOString().slice(0, 10);
}

export function CalendarPage() {
  const [rangeMode, setRangeMode] = useState<RangeMode>('month');
  const [anchor, setAnchor] = useState<string>(isoToday());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('combined');
  const { from, to } = computeRange(anchor, rangeMode);

  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar', from, to, CELL_TOP_PER_DAY],
    queryFn: () =>
      api.get<CalendarResponse>(
        `/calendar?from=${from}&to=${to}&topPerDay=${CELL_TOP_PER_DAY}`,
      ),
  });

  // Day currently shown in the detail modal — retrieved from the calendar
  // response so we can pass planned ghosts + overflow items into the modal
  // without an extra round-trip.
  const selectedDayData = useMemo(
    () => (data && selectedDay ? data.days.find((d) => d.date === selectedDay) : undefined),
    [data, selectedDay],
  );

  // "Aujourd'hui" ne compare pas la date brute mais la fenêtre : si le mois
  // (ou la semaine) courant contient today, on est déjà "à aujourd'hui".
  const todayRange = useMemo(() => computeRange(isoToday(), rangeMode), [rangeMode]);
  const isAtToday = from === todayRange.from && to === todayRange.to;

  const shortLabel = rangeMode === 'week' ? 'sem.' : 'mois';

  return (
    <div className="h-full flex flex-col overflow-hidden px-4 md:px-6 lg:px-8 2xl:px-12 py-3 md:py-4 max-w-[1900px] mx-auto w-full">
      <header className="shrink-0 flex items-end justify-between mb-2 md:mb-3 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold leading-tight">{formatRangeLabel(from, to)}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            du {from} au {to}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(shiftAnchor(anchor, rangeMode, -1))}
            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
            title={`${shortLabel === 'sem.' ? 'Semaine' : 'Mois'} précédent(e)`}
          >
            ← {shortLabel}
          </button>

          {!isAtToday && (
            <button
              onClick={() => setAnchor(isoToday())}
              className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
            >
              Aujourd'hui
            </button>
          )}

          <button
            onClick={() => setAnchor(shiftAnchor(anchor, rangeMode, 1))}
            className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
            title={`${shortLabel === 'sem.' ? 'Semaine' : 'Mois'} suivant(e)`}
          >
            {shortLabel} →
          </button>

          <RangeToggle value={rangeMode} onChange={setRangeMode} />
          <ModeToggle value={mode} onChange={setMode} />
        </div>
      </header>

      {isLoading && <p className="text-sm text-gray-500">Chargement…</p>}
      {error && <p className="text-sm text-red-600">Erreur : {(error as Error).message}</p>}

      {data && (
        <>
          <div className="flex-1 min-h-0">
            <CalendarView data={data} mode={mode} onDayClick={setSelectedDay} />
          </div>
          <footer className="shrink-0 mt-2 md:mt-3 flex gap-6 md:gap-10 flex-wrap">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                Dépenses ({shortLabel})
              </span>
              <span className="text-base md:text-lg font-bold tabular-nums text-cat-red-fg dark:text-cat-red">
                − {formatCurrency(data.totals.debit, true)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                Revenus ({shortLabel})
              </span>
              <span className="text-base md:text-lg font-bold tabular-nums text-cat-green-fg dark:text-cat-green">
                + {formatCurrency(data.totals.credit, true)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium">
                Solde net
              </span>
              <span
                className={`text-base md:text-lg font-bold tabular-nums ${
                  Number(data.totals.net) >= 0
                    ? 'text-cat-green-fg dark:text-cat-green'
                    : 'text-cat-red-fg dark:text-cat-red'
                }`}
              >
                {formatCurrency(data.totals.net, true)}
              </span>
            </div>
          </footer>
        </>
      )}

      {selectedDay && (
        <DayDetailModal
          date={selectedDay}
          plannedGhosts={selectedDayData?.plannedGhosts ?? []}
          overflowItems={selectedDayData?.overflowItems ?? []}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function RangeToggle({
  value,
  onChange,
}: {
  value: RangeMode;
  onChange: (r: RangeMode) => void;
}) {
  const opts: { key: RangeMode; label: string }[] = [
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
  ];
  return (
    <div className="inline-flex border border-gray-200 rounded-md overflow-hidden text-xs">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 ${
            value === o.key
              ? 'bg-cat-teal-bg text-cat-teal-fg font-medium'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ModeToggle({ value, onChange }: { value: ViewMode; onChange: (m: ViewMode) => void }) {
  const opts: { key: ViewMode; label: string }[] = [
    { key: 'real', label: 'Réel' },
    { key: 'planned', label: 'Prévu' },
    { key: 'combined', label: 'Combiné' },
  ];
  return (
    <div className="inline-flex border border-gray-200 rounded-md overflow-hidden text-xs">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 ${
            value === o.key
              ? 'bg-cat-purple-bg text-cat-purple-fg font-medium'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
