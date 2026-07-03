import { BudgetRecurrence } from '@prisma/client';

/**
 * How many times a recurrence hits within a monthly window [monthStart, monthEnd].
 * We anchor from `anchorDate` and walk forward until we exit the window.
 * Returns 0 if the item was inactive during the window.
 */
export function occurrencesInMonth(
  recurrence: BudgetRecurrence,
  anchorDate: Date,
  endDate: Date | null,
  monthStart: Date,
  monthEnd: Date,
): number {
  // If the item ended before the window, no occurrences.
  if (endDate && endDate < monthStart) return 0;

  // Once = only if anchorDate falls in the window.
  if (recurrence === 'ONCE') {
    return anchorDate >= monthStart && anchorDate <= monthEnd ? 1 : 0;
  }

  // For DAILY / WEEKLY / BIWEEKLY / MONTHLY / YEARLY, walk from anchorDate.
  const step: Record<Exclude<BudgetRecurrence, 'ONCE'>, (d: Date) => Date> = {
    DAILY:    (d) => addDays(d, 1),
    WEEKLY:   (d) => addDays(d, 7),
    BIWEEKLY: (d) => addDays(d, 14),
    MONTHLY:  (d) => addMonths(d, 1),
    YEARLY:   (d) => addMonths(d, 12),
  };

  const stepFn = step[recurrence];
  let count = 0;
  let cursor = new Date(anchorDate);

  // Fast-forward the cursor so we're at or after monthStart.
  while (cursor < monthStart) cursor = stepFn(cursor);

  // Walk forward across the window.
  while (cursor <= monthEnd) {
    if (endDate && cursor > endDate) break;
    count++;
    cursor = stepFn(cursor);
  }

  return count;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

function addMonths(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCMonth(c.getUTCMonth() + n);
  return c;
}

/**
 * Returns the ordered list of dates at which a recurrence lands within
 * [from, to] inclusive. Same walking logic as `occurrencesInMonth` but keeps
 * the actual dates. Skips items whose window is before the range or after
 * their endDate.
 */
export function occurrenceDatesInRange(
  recurrence: BudgetRecurrence,
  anchorDate: Date,
  endDate: Date | null,
  from: Date,
  to: Date,
): Date[] {
  if (endDate && endDate < from) return [];

  if (recurrence === 'ONCE') {
    return anchorDate >= from && anchorDate <= to ? [new Date(anchorDate)] : [];
  }

  const step: Record<Exclude<BudgetRecurrence, 'ONCE'>, (d: Date) => Date> = {
    DAILY:    (d) => addDays(d, 1),
    WEEKLY:   (d) => addDays(d, 7),
    BIWEEKLY: (d) => addDays(d, 14),
    MONTHLY:  (d) => addMonths(d, 1),
    YEARLY:   (d) => addMonths(d, 12),
  };
  const stepFn = step[recurrence];

  const dates: Date[] = [];
  let cursor = new Date(anchorDate);

  // Fast-forward to at-or-after the window start.
  while (cursor < from) cursor = stepFn(cursor);

  // Walk across the window.
  while (cursor <= to) {
    if (endDate && cursor > endDate) break;
    dates.push(new Date(cursor));
    cursor = stepFn(cursor);
  }
  return dates;
}
