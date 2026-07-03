/**
 * Formatting helpers — kept here so we don't sprinkle `Intl.NumberFormat`
 * instances all over the components.
 */

const currencyFmt = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

const currencyDetailedFmt = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
});

export function formatCurrency(input: string | number, detailed = false): string {
  const n = typeof input === 'string' ? Number(input) : input;
  return (detailed ? currencyDetailedFmt : currencyFmt).format(n);
}

/** "2025-12-31" → "31" (day-of-month, for calendar cell headers). */
export function dayOfMonth(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

/** Returns YYYY-MM-DD for `today - daysBack` in local time. */
export function isoDaysAgo(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD (local). */
export function isoToday(): string {
  return isoDaysAgo(0);
}

const monthFmt = new Intl.DateTimeFormat('fr-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * "Décembre 2025" if the range sits in one month,
 * "Décembre 2025 → Janvier 2026" if it spans two,
 * "Nov. 2025 → Jan. 2026" (short) if it spans three or more.
 */
export function formatRangeLabel(fromIso: string, toIso: string): string {
  const from = new Date(fromIso + 'T00:00:00Z');
  const to = new Date(toIso + 'T00:00:00Z');
  const sameMonth = from.getUTCFullYear() === to.getUTCFullYear() && from.getUTCMonth() === to.getUTCMonth();
  if (sameMonth) return capitalize(monthFmt.format(from));

  const monthsSpan =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());

  if (monthsSpan === 1) {
    return `${capitalize(monthFmt.format(from))} → ${capitalize(monthFmt.format(to))}`;
  }
  const shortFmt = new Intl.DateTimeFormat('fr-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${capitalize(shortFmt.format(from))} → ${capitalize(shortFmt.format(to))}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
