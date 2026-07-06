import { CalendarDay, CalendarTx, OverflowItem, PlannedGhost } from '../../lib/api';
import { dayOfMonth, formatCurrency, isoToday } from '../../lib/format';

export type ViewMode = 'real' | 'planned' | 'combined';

/**
 * One day in the calendar grid. Renders three kinds of rows depending on the
 * view mode:
 *   • real transactions (solid style — colored left border + soft bg)
 *   • matched actuals (solid + delta badge vs. planned)
 *   • ghost planned items (dashed border, italic, opacity 60%)
 *
 * Visual hierarchy tuned for scan-ability:
 *   day number (largest) > day total (medium) > chips (smallest).
 * Weekends get a subtle warm tint; empty cells get a dashed border so the eye
 * distinguishes "no activity" from "packed day". The first day of a new month
 * shows an orange month badge next to the number so month rollovers pop.
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
  const d = new Date(day.date + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const dom = d.getUTCDate();
  const isMonthStart = dom === 1;
  const monthShort = new Intl.DateTimeFormat('fr-CA', { month: 'short', timeZone: 'UTC' })
    .format(d)
    .replace('.', '');

  // Filter what shows up based on the view toggle.
  const showActuals = mode !== 'planned';
  const showGhosts = mode !== 'real';
  const visibleTx = showActuals ? day.transactions : [];
  const visibleGhosts = showGhosts ? day.plannedGhosts : [];

  const hasSomething = visibleTx.length + visibleGhosts.length > 0;
  const clickable = hasSomething && !!onClick;
  const isEmpty = !hasSomething;

  // Compute the corner label based on mode.
  const cornerLabel = computeCorner(day, mode);

  // Cell background — layered so today > weekend > empty > default.
  const cellBg = isToday
    ? 'bg-cat-teal-bg/50 dark:bg-cat-teal-fg/15'
    : isEmpty
      ? 'bg-transparent'
      : isWeekend
        ? 'bg-brand-50/60 dark:bg-gray-900/70'
        : 'bg-gray-50 dark:bg-gray-900/50';

  // Border — today stronger, empty dashed, else solid.
  const cellBorder = isToday
    ? 'border-2 border-cat-teal'
    : isEmpty
      ? 'border border-dashed border-gray-200/70 dark:border-gray-800/70'
      : 'border border-gray-200 dark:border-gray-800';

  return (
    <button
      type="button"
      onClick={clickable ? () => onClick!(day.date) : undefined}
      disabled={!clickable}
      className={`text-left rounded-md md:rounded-lg flex flex-col gap-1 overflow-hidden transition
        min-h-0 p-1.5 md:p-2
        ${cellBg} ${cellBorder}
        ${clickable ? 'hover:border-gray-400 dark:hover:border-gray-600 hover:bg-white dark:hover:bg-gray-800 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="flex items-baseline gap-1 min-w-0">
          {isMonthStart && (
            <span className="shrink-0 text-[9px] md:text-[10px] font-bold uppercase tracking-wider bg-brand-300 text-white px-1 py-0.5 rounded leading-none">
              {monthShort}
            </span>
          )}
          <span
            className={`font-bold leading-none ${
              isEmpty
                ? 'text-gray-400 dark:text-gray-600 text-base md:text-lg'
                : isToday
                  ? 'text-cat-teal-fg dark:text-cat-teal text-lg md:text-xl lg:text-2xl'
                  : 'text-gray-900 dark:text-gray-100 text-lg md:text-xl lg:text-2xl'
            }`}
          >
            {dayOfMonth(day.date)}
          </span>
        </span>
        {cornerLabel && (
          <span className={`text-xs md:text-sm tabular-nums font-semibold shrink-0 ${cornerLabel.className}`}>
            {cornerLabel.text}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-0.5 md:gap-1 overflow-hidden">
        {visibleTx.map((tx) => <TxRow key={tx.id} tx={tx} />)}
        {visibleGhosts.map((g) => <GhostRow key={g.budgetItemId} ghost={g} />)}
        {day.overflowCount > 0 && (
          <span
            className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400 px-1 shrink-0 font-medium"
            title={overflowTooltip(day.overflowItems, day.overflowCount)}
          >
            + {day.overflowCount} autres
          </span>
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
  // Credits always use teal so income reads as income at a glance,
  // regardless of the source category's assigned color.
  const color = isCredit ? 'teal' : (tx.category?.color ?? 'gray');
  const label = tx.category?.name ?? tx.description;
  const icon = tx.category?.icon;
  const mp = tx.matchedPlanned;

  return (
    <div
      className={`shrink-0 flex justify-between items-center gap-1.5 rounded pl-1.5 pr-1.5 md:pl-2 md:pr-2 py-0.5 md:py-1 text-xs md:text-[13px]
        border-l-[3px] border-cat-${color}
        bg-cat-${color}-bg text-cat-${color}-fg
        dark:bg-cat-${color}/15 dark:text-cat-${color}`}
    >
      <span className="truncate flex items-center gap-1 min-w-0">
        {mp && <span title={`Réconcilié avec "${mp.name}"`} className="shrink-0">🎯</span>}
        {icon && <i className={`ti ${icon} text-[11px] md:text-xs shrink-0 opacity-75`} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular-nums font-semibold shrink-0 flex items-center gap-1">
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
  const icon = ghost.categoryIcon;

  return (
    <div
      className={`shrink-0 flex justify-between items-center gap-1.5 rounded pl-1.5 pr-1.5 md:pl-2 md:pr-2 py-0.5 md:py-1 text-xs md:text-[13px]
        border-l-[3px] border-dashed border-cat-${color} bg-transparent
        text-cat-${color}-fg dark:text-cat-${color} opacity-80`}
      title={`Prévu · ${ghost.name}`}
    >
      <span className="truncate flex items-center gap-1 min-w-0">
        <span className="shrink-0 opacity-70">◷</span>
        {icon && <i className={`ti ${icon} text-[11px] md:text-xs shrink-0 opacity-75`} aria-hidden="true" />}
        <span className="truncate">{ghost.name}</span>
      </span>
      <span className="tabular-nums font-semibold shrink-0">
        {sign}{formatCurrency(ghost.plannedAmount)}
      </span>
    </div>
  );
}

function DeltaBadge({ delta, status }: { delta: string; status: 'ok' | 'over' | 'under' }) {
  const n = Number(delta);
  if (Math.abs(n) < 0.005) {
    return (
      <span className="text-[10px] text-cat-green-fg dark:text-cat-green" title="Écart nul">✓</span>
    );
  }
  const cls =
    status === 'over'
      ? 'text-cat-red-fg dark:text-cat-red'
      : status === 'under'
        ? 'text-cat-teal-fg dark:text-cat-teal'
        : 'text-cat-green-fg dark:text-cat-green';
  return (
    <span className={`text-[10px] ${cls}`} title={`Écart vs. prévu`}>
      ({n > 0 ? '+' : ''}{formatCurrency(delta)})
    </span>
  );
}

// -------------------------------------------------------------------------
//  Overflow tooltip — plain-text list of what the "+N autres" chip hides.
//  Kept in `title` (native tooltip) so the user can peek without clicking.
// -------------------------------------------------------------------------

function overflowTooltip(items: OverflowItem[], count: number): string {
  if (!items || items.length === 0) return `${count} items supplémentaires`;
  return items
    .map((it) => {
      const amt = Number(it.amountSigned);
      const sign = amt > 0 ? '+' : amt < 0 ? '−' : '';
      const prefix = it.kind === 'ghost' ? '◷ ' : '';
      return `${prefix}${it.name} · ${sign}${formatCurrency(Math.abs(amt))}`;
    })
    .join('\n');
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
      className: realNet >= 0 ? 'text-cat-green-fg dark:text-cat-green' : 'text-cat-red-fg dark:text-cat-red',
    };
  }

  if (mode === 'planned') {
    if (day.plannedGhosts.length === 0) return null;
    return {
      text: `${plannedNet >= 0 ? '+' : ''}${formatCurrency(plannedNet)}`,
      className: 'text-gray-500 dark:text-gray-400 italic',
    };
  }

  // combined
  if (day.txCount === 0 && day.plannedGhosts.length === 0) return null;
  if (day.plannedGhosts.length === 0) {
    return {
      text: `${realNet >= 0 ? '+' : ''}${formatCurrency(realNet)}`,
      className: realNet >= 0 ? 'text-cat-green-fg dark:text-cat-green' : 'text-cat-red-fg dark:text-cat-red',
    };
  }
  if (day.txCount === 0) {
    return {
      text: `~ ${plannedNet >= 0 ? '+' : ''}${formatCurrency(plannedNet)}`,
      className: 'text-gray-500 dark:text-gray-400 italic',
    };
  }
  return {
    text: `${realNet >= 0 ? '+' : ''}${formatCurrency(realNet)}`,
    className: realNet >= 0 ? 'text-cat-green-fg dark:text-cat-green' : 'text-cat-red-fg dark:text-cat-red',
  };
}
