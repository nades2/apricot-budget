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

  // Monday = 0 for our column ordering (fr-CA week starts on Monday).
  const firstDate = new Date(data.days[0].date);
  const dow = (firstDate.getUTCDay() + 6) % 7; // Sun(0)→6, Mon(1)→0, ...
  const padding = Array.from({ length: dow });

  return (
    <div className="h-full flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="shrink-0 grid grid-cols-7 text-[10px] md:text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 px-2 md:px-3 pt-2 md:pt-3">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
          <div key={d} className="px-2 py-0.5">{d}</div>
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
