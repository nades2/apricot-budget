import { CalendarResponse } from '../../lib/api';
import { CalendarCell, ViewMode } from './CalendarCell';

/**
 * Renders the days as a 7-column grid, padded with empty cells so the first
 * day lands on the correct weekday. Works identically for 7-day and 30-day
 * ranges — the grid just has fewer or more rows.
 */
export function CalendarView({
  data,
  mode = 'combined',
  onDayClick,
}: {
  data: CalendarResponse;
  mode?: ViewMode;
  onDayClick?: (date: string) => void;
}) {
  if (data.days.length === 0) return null;

  // Sunday = 0 for our column ordering (convention nord-américaine :
  // dimanche à gauche, samedi à droite).
  const firstDate = new Date(data.days[0].date);
  const dow = firstDate.getUTCDay(); // Sun(0), Mon(1), ..., Sat(6)
  const padding = Array.from({ length: dow });

  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  return (
    <div className="h-full flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="shrink-0 flex items-center gap-4 px-3 md:px-4 pt-2 pb-1 text-[11px] text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800/60">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-1 rounded bg-cat-teal" />
          Revenu
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-1 rounded bg-cat-red" />
          Dépense
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-0 border-t-2 border-dashed border-cat-amber" />
          Prévu
        </span>
      </div>
      <div className="shrink-0 grid grid-cols-7 text-[11px] md:text-xs font-bold uppercase tracking-widest px-2 md:px-3 pt-2 md:pt-3">
        {dayNames.map((d, i) => (
          <div
            key={d}
            className={`px-2 py-0.5 ${
              // Weekend highlight : Dim (col 0) et Sam (col 6).
              i === 0 || i === 6 ? 'text-brand-500 dark:text-brand-300' : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      {/* auto-rows-fr = every row gets an equal share of the remaining height,
          so 5 or 6 weeks always fit the viewport without vertical scroll. */}
      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-7 grid-flow-row auto-rows-fr gap-1.5 md:gap-2 lg:gap-2.5 p-2 md:p-3">
        {padding.map((_, i) => <div key={`pad-${i}`} />)}
        {data.days.map((day) => (
          <CalendarCell key={day.date} day={day} mode={mode} onClick={onDayClick} />
        ))}
      </div>
    </div>
  );
}
