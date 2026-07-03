import { CalendarDay, CalendarTx, PlannedGhost } from '../../lib/api';
import { dayOfMonth, formatCurrency, isoToday } from '../../lib/format';

export type ViewMode = 'real' | 'planned' | 'combined';

/**
 * One day in the calendar grid. Renders three kinds of rows depending on the
 * view mode:
 *   • real transactions (solid style)
 *   • matched actuals (solid + delta badge vs. planned)
 *   • ghost planned items (dashed border, italic, opacity 60%)
 */
export function CalendarCell({
  day,
  mode,
  onClick,
}: {
  day: CalendarDay;
  mode: ViewMode;
  onClick?: (date: string) => void;
}) {
  const isToday = day.date === isoToday();
  const net = Number(day.net);

  // Filter what shows up based on the view toggle.
  const showActuals = mode !== 'planned';
  const showGhosts = mode !== 'real';
  const visibleTx = showActuals ? day.transactions : [];
  const visibleGhosts = showGhosts ? day.plannedGhosts : [];

  const hasSomething = visibleTx.length + visibleGhosts.length > 0;
  const clickable = hasSomething && !!onClick;

  // Compute the corner label based on mode.
  const cornerLabel = computeCorner(day, mode);

  return (
    <button
      type="button"
      onClick={clickable ? () => onClick!(day.date) : undefined}
      disabled={!clickable}
      className={`text-left rounded-md md:rounded-lg border flex flex-col gap-0.5 md:gap-1 overflow-hidden bg-gray-50 dark:bg-gray-900/50 transition
        min-h-0 p-1.5 md:p-2
        ${isToday ? 'border-cat-teal ring-1 ring-cat-teal-bg' : 'border-gray-200 dark:border-gray-800'}
        ${clickable ? 'hover:border-gray-400 dark:hover:border-gray-600 hover:bg-white dark:hover:bg-gray-800 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-sm md:text-base lg:text-lg font-medium ${isToday ? 'text-cat-teal-fg' : 'text-gray-700 dark:text-gray-300'}`}>
          {dayOfMonth(day.date)}
        </span>
        {cornerLabel && (
          <span className={`text-xs md:text-sm tabular-nums font-medium ${cornerLabel.className}`}>
            {cornerLabel.text}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-0.5 md:gap-1 overflow-hidden">
        {visibleTx.map((tx) => <TxRow key={tx.id} tx={tx} />)}
        {visibleGhosts.map((g) => <GhostRow key={g.budgetItemId} ghost={g} />)}
        {day.overflowCount > 0 && (
          <span className="text-[10px] md:text-xs text-gray-400 dark:text-gray-600 italic px-1 shrink-0">+ {day.overflowCount} autres</span>
        )}
      </div>
    </button>
  );
}

// -------------------------------------------------------------------------
//  Row renderers
// -------------------------------------------------------------------------

function TxRow({ tx }: { tx: CalendarTx }) {
  const amt = Number(tx.amount);
  const isCredit = amt > 0;
  const color = tx.category?.color ?? 'gray';
  const bgClass = isCredit ? 'bg-cat-teal-bg text-cat-teal-fg' : `bg-cat-${color}-bg text-cat-${color}-fg`;
  const label = tx.category?.name ?? tx.description;
  const mp = tx.matchedPlanned;

  return (
    <div className={`flex justify-between items-center gap-1.5 rounded px-1.5 md:px-2 py-0.5 md:py-1 text-xs md:text-[13px] ${bgClass}`}>
      <span className="truncate flex items-center gap-1">
        {mp && <span title={`Réconcilié avec "${mp.name}"`}>🎯</span>}
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular-nums font-medium shrink-0 flex items-center gap-1">
        {isCredit ? '+' : ''}{formatCurrency(tx.amount)}
        {mp && <DeltaBadge delta={mp.delta} status={mp.deltaStatus} />}
      </span>
    </div>
  );
}

function GhostRow({ ghost }: { ghost: PlannedGhost }) {
  const color = ghost.categoryColor ?? 'gray';
  const isIncome = ghost.direction === 'INCOME';
  const sign = isIncome ? '+' : '−';

  return (
    <div
      className={`flex justify-between items-center gap-1.5 rounded px-1.5 md:px-2 py-0.5 md:py-1 text-xs md:text-[13px] italic opacity-60 border border-dashed border-cat-${color}-fg/40 bg-cat-${color}-bg/40`}
      title={`Prévu · ${ghost.name}`}
    >
      <span className="truncate flex items-center gap-1">
        <span className="shrink-0">◷</span>
        <span className="truncate">{ghost.name}</span>
      </span>
      <span className={`tabular-nums font-medium shrink-0 text-cat-${color}-fg`}>
        {sign}{formatCurrency(ghost.plannedAmount)}
      </span>
    </div>
  );
}

function DeltaBadge({ delta, status }: { delta: string; status: 'ok' | 'over' | 'under' }) {
  const n = Number(delta);
  if (Math.abs(n) < 0.005) return <span className="text-[9px] text-cat-green-fg" title="Écart nul">✓</span>;
  const cls = status === 'over' ? 'text-cat-red-fg' : status === 'under' ? 'text-cat-teal-fg' : 'text-cat-green-fg';
  return (
    <span className={`text-[9px] ${cls}`} title={`Écart vs. prévu`}>
      ({n > 0 ? '+' : ''}{formatCurrency(delta)})
    </span>
  );
}

// -------------------------------------------------------------------------
//  Corner label — the day's headline number.
// -------------------------------------------------------------------------

function computeCorner(day: CalendarDay, mode: ViewMode): { text: string; className: string } | null {
  const realNet = Number(day.net);
  const plannedNet = day.plannedGhosts.reduce(
    (sum, g) => sum + (g.direction === 'INCOME' ? 1 : -1) * Number(g.plannedAmount),
    0,
  );

  if (mode === 'real') {
    if (day.txCount === 0) return null;
    return {
      text: `${realNet >= 0 ? '+' : ''}${formatCurrency(realNet)}`,
      className: realNet >= 0 ? 'text-cat-green-fg' : 'text-cat-red-fg',
    };
  }

  if (mode === 'planned') {
    if (day.plannedGhosts.length === 0) return null;
    return {
      text: `${plannedNet >= 0 ? '+' : ''}${formatCurrency(plannedNet)}`,
      className: 'text-gray-500 italic',
    };
  }

  // combined
  if (day.txCount === 0 && day.plannedGhosts.length === 0) return null;
  if (day.plannedGhosts.length === 0) {
    return {
      text: `${realNet >= 0 ? '+' : ''}${formatCurrency(realNet)}`,
      className: realNet >= 0 ? 'text-cat-green-fg' : 'text-cat-red-fg',
    };
  }
  if (day.txCount === 0) {
    return {
      text: `~ ${plannedNet >= 0 ? '+' : ''}${formatCurrency(plannedNet)}`,
      className: 'text-gray-500 italic',
    };
  }
  return {
    text: `${realNet >= 0 ? '+' : ''}${formatCurrency(realNet)}`,
    className: realNet >= 0 ? 'text-cat-green-fg' : 'text-cat-red-fg',
  };
}
