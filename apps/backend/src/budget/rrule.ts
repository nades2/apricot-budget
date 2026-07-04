import { BudgetItem } from '@prisma/client';
import { RRule } from 'rrule';
import { occurrenceDatesInRange } from './recurrence';

/**
 * Renvoie toutes les occurrences d'un `BudgetItem` dans [from, to] inclusif.
 *
 * Deux modes :
 *   - Si `item.rrule` est défini, on utilise la librairie `rrule` (RFC 5545).
 *     `DTSTART` = `item.dtstart` ou fallback `item.anchorDate`.
 *     `UNTIL` = `item.endDate` si défini.
 *   - Sinon on retombe sur `occurrenceDatesInRange` (walker basé sur l'enum
 *     `recurrence`) pour rester compatible avec les BudgetItem existants.
 *
 * Retourne des `Date` UTC à minuit — cohérent avec `postedAt @db.Date`.
 */
export function budgetItemOccurrences(
  item: Pick<BudgetItem, 'recurrence' | 'anchorDate' | 'endDate' | 'rrule' | 'dtstart'>,
  from: Date,
  to: Date,
): Date[] {
  // Chemin rapide : pas de RRULE → walker enum historique.
  if (!item.rrule) {
    return occurrenceDatesInRange(item.recurrence, item.anchorDate, item.endDate, from, to);
  }

  // Chemin RRULE : on construit la règle à partir de la chaîne + DTSTART.
  const dtstart = normalizeToUtcMidnight(item.dtstart ?? item.anchorDate);
  const options = RRule.parseString(item.rrule);
  options.dtstart = dtstart;
  if (item.endDate) {
    options.until = normalizeToUtcMidnight(item.endDate);
  }
  const rule = new RRule(options);

  // `between` est inclusif des bornes quand le 3e argument est `true`.
  const raw = rule.between(
    normalizeToUtcMidnight(from),
    normalizeToUtcMidnight(to),
    true,
  );

  // Filet de sécurité : rrule.js peut renvoyer des dates légèrement décalées
  // selon la timezone. On normalise à minuit UTC pour matcher `@db.Date`.
  return raw.map(normalizeToUtcMidnight);
}

function normalizeToUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
