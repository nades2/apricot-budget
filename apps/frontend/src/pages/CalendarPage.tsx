import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, CalendarResponse } from '../lib/api';
import { formatCurrency, formatRangeLabel, isoToday } from '../lib/format';
import { CalendarView } from '../components/Calendar/CalendarView';
import { ViewMode } from '../components/Calendar/CalendarCell';
import { DayDetailModal } from '../components/Calendar/DayDetailModal';

type Range = 7 | 30;

/**
 * Compute a range [from, to] of `size` days ending on `anchorIso` inclusive.
 * `anchorIso` is the last day shown (typically "today" or a past reference).
 */
function computeRange(anchorIso: string, size: Range): { from: string; to: string } {
  const to = new Date(anchorIso + 'T00:00:00Z');
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (size - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CalendarPage() {
  const [range, setRange] = useState<Range>(30);
  const [anchor, setAnchor] = useState<string>(isoToday());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('combined');
  const { from, to } = computeRange(anchor, range);

  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.get<CalendarResponse>(`/calendar?from=${from}&to=${to}`),
  });

  const isAtToday = anchor === isoToday();

  return (
    <div className="h-full flex flex-col overflow-hidden px-4 md:px-6 lg:px-8 2xl:px-12 py-3 md:py-4 max-w-[1900px] mx-auto w-full">
      <header className="shrink-0 flex items-end justify-between mb-2 md:mb-3 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold leading-tight">{formatRangeLabel(from, to)}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {range} jours · du {from} au {to}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAnchor(shiftIso(anchor, -range))}
            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50"
            title="Période précédente"
          >
            ← {range} j
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
            onClick={() => setAnchor(shiftIso(anchor, range))}
            className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Période suivante"
          >
            {range} j →
          </button>

          <RangeToggle value={range} onChange={setRange} />
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
          <footer className="shrink-0 mt-2 md:mt-3 flex gap-4 md:gap-6 text-xs md:text-sm text-gray-600 dark:text-gray-400 flex-wrap">
            <span>
              <span className="text-cat-red-fg font-medium">− {formatCurrency(data.totals.debit, true)}</span>
              <span className="ml-1 text-gray-500">dépenses</span>
            </span>
            <span>
              <span className="text-cat-green-fg font-medium">+ {formatCurrency(data.totals.credit, true)}</span>
              <span className="ml-1 text-gray-500">revenus</span>
            </span>
            <span>
              Solde net :{' '}
              <b className={Number(data.totals.net) >= 0 ? 'text-cat-green-fg' : 'text-cat-red-fg'}>
                {formatCurrency(data.totals.net, true)}
              </b>
            </span>
          </footer>
        </>
      )}

      {selectedDay && (
        <DayDetailModal date={selectedDay} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}

function RangeToggle({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex border border-gray-200 rounded-md overflow-hidden text-xs">
      {([7, 30] as const).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-3 py-1 ${
            value === r
              ? 'bg-cat-teal-bg text-cat-teal-fg font-medium'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          {r} j
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
