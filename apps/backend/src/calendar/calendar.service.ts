import { BadRequestException, Injectable } from '@nestjs/common';
import { BudgetDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryCalendarDto } from './dto/query-calendar.dto';
import { occurrenceDatesInRange } from '../budget/recurrence';

/**
 * Category info as inlined in a calendar cell — enough for the UI to render
 * a colored pill with the right icon.
 */
type CategoryLite = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  direction: 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'NEUTRAL';
};

export type MatchedPlanned = {
  budgetItemId: string;
  name: string;
  plannedAmount: string;              // positive
  delta: string;                      // signed against plannedAmount (positive = over/bonus)
  deltaStatus: 'ok' | 'over' | 'under';
};

export type CalendarTransaction = {
  id: string;
  description: string;
  amount: string;                     // signed Decimal, stringified
  category: CategoryLite | null;
  matchedPlanned?: MatchedPlanned;
};

export type PlannedGhost = {
  budgetItemId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  direction: BudgetDirection;
  plannedAmount: string;              // positive
};

export type CalendarDay = {
  date: string;
  totalDebit: string;
  totalCredit: string;
  net: string;
  txCount: number;
  transactions: CalendarTransaction[];
  overflowCount: number;
  plannedGhosts: PlannedGhost[];
};

export type CalendarResponse = {
  from: string;
  to: string;
  days: CalendarDay[];
  totals: { debit: string; credit: string; net: string };
};

@Injectable()
export class CalendarService {
  private static readonly MAX_RANGE_DAYS = 92;
  private static readonly MATCH_WINDOW_DAYS = 3;

  constructor(private readonly prisma: PrismaService) {}

  async build(userId: string, q: QueryCalendarDto): Promise<CalendarResponse> {
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (from > to) throw new BadRequestException('`from` doit être ≤ `to`');
    const spanDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (spanDays > CalendarService.MAX_RANGE_DAYS) {
      throw new BadRequestException(`Fenêtre max ${CalendarService.MAX_RANGE_DAYS} jours`);
    }

    const topPerDay = q.topPerDay ?? 3;
    const accountFilter = q.accountId ? { accountId: q.accountId } : {};

    // ------------------------------------------------------------------
    //  1) Fetch transactions in the window (extended by ±MATCH_WINDOW_DAYS
    //     so that a planned item near the edge can still find a match).
    // ------------------------------------------------------------------
    const fetchFrom = new Date(from);
    fetchFrom.setUTCDate(fetchFrom.getUTCDate() - CalendarService.MATCH_WINDOW_DAYS);
    const fetchTo = new Date(to);
    fetchTo.setUTCDate(fetchTo.getUTCDate() + CalendarService.MATCH_WINDOW_DAYS);

    const txs = await this.prisma.transaction.findMany({
      where: {
        userId,
        ...accountFilter,
        postedAt: { gte: fetchFrom, lte: fetchTo },
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true, direction: true } },
      },
      orderBy: [{ postedAt: 'asc' }],
    });

    // ------------------------------------------------------------------
    //  2) Fetch active budget items (DAILY excluded — noise at day level).
    // ------------------------------------------------------------------
    const items = await this.prisma.budgetItem.findMany({
      where: { userId, isActive: true, recurrence: { not: 'DAILY' } },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
      },
    });

    // Enumerate each item's occurrences within [from, to].
    type Occurrence = {
      key: string;                    // stable id — used for match bookkeeping
      itemId: string;
      date: Date;
      name: string;
      categoryId: string;
      categoryName: string;
      categoryColor: string | null;
      categoryIcon: string | null;
      direction: BudgetDirection;
      plannedAmount: Prisma.Decimal;  // always positive
    };
    const occurrences: Occurrence[] = [];
    for (const it of items) {
      const dates = occurrenceDatesInRange(it.recurrence, it.anchorDate, it.endDate, from, to);
      for (let i = 0; i < dates.length; i++) {
        occurrences.push({
          key: `${it.id}#${i}`,
          itemId: it.id,
          date: dates[i],
          name: it.name,
          categoryId: it.categoryId,
          categoryName: it.category.name,
          categoryColor: it.category.color,
          categoryIcon: it.category.icon,
          direction: it.direction,
          plannedAmount: new Prisma.Decimal(it.amount),
        });
      }
    }
    // Chronological order gives a deterministic first-come-first-served match.
    occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());

    // ------------------------------------------------------------------
    //  3) Match — each occurrence claims at most one transaction, and vice
    //     versa. Best candidate = same category, right direction, within
    //     ±MATCH_WINDOW_DAYS, closest by date, tie-break by closest amount.
    // ------------------------------------------------------------------
    const matchedTxIds = new Set<string>();
    const matchByTxId = new Map<string, MatchedPlanned>();

    for (const occ of occurrences) {
      const winStart = new Date(occ.date);
      winStart.setUTCDate(winStart.getUTCDate() - CalendarService.MATCH_WINDOW_DAYS);
      const winEnd = new Date(occ.date);
      winEnd.setUTCDate(winEnd.getUTCDate() + CalendarService.MATCH_WINDOW_DAYS);

      const candidates = txs.filter((tx) => {
        if (matchedTxIds.has(tx.id)) return false;
        if (tx.categoryId !== occ.categoryId) return false;
        const amt = new Prisma.Decimal(tx.amount);
        if (occ.direction === 'EXPENSE' ? !amt.isNegative() : !amt.isPositive()) return false;
        return tx.postedAt >= winStart && tx.postedAt <= winEnd;
      });
      if (candidates.length === 0) continue;

      candidates.sort((a, b) => {
        const dA = Math.abs(a.postedAt.getTime() - occ.date.getTime());
        const dB = Math.abs(b.postedAt.getTime() - occ.date.getTime());
        if (dA !== dB) return dA - dB;
        const aA = new Prisma.Decimal(a.amount).abs().minus(occ.plannedAmount).abs();
        const aB = new Prisma.Decimal(b.amount).abs().minus(occ.plannedAmount).abs();
        return aA.comparedTo(aB);
      });
      const best = candidates[0];
      matchedTxIds.add(best.id);

      const actualAbs = new Prisma.Decimal(best.amount).abs();
      const delta = actualAbs.minus(occ.plannedAmount);
      matchByTxId.set(best.id, {
        budgetItemId: occ.itemId,
        name: occ.name,
        plannedAmount: occ.plannedAmount.toString(),
        delta: delta.toString(),
        deltaStatus: this.deltaStatus(occ.direction, occ.plannedAmount, actualAbs),
      });
      // Mark this occurrence as consumed by storing the txId back — used below.
      (occ as Occurrence & { matchedTxId?: string }).matchedTxId = best.id;
    }

    // ------------------------------------------------------------------
    //  4) Build the per-day structure. Only transactions in [from, to] are
    //     reported — the ±3 fetch window was just for matching.
    // ------------------------------------------------------------------
    const byDay = new Map<string, CalendarDay>();
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      byDay.set(iso, {
        date: iso,
        totalDebit: '0',
        totalCredit: '0',
        net: '0',
        txCount: 0,
        transactions: [],
        overflowCount: 0,
        plannedGhosts: [],
      });
    }

    let grandDebit = new Prisma.Decimal(0);
    let grandCredit = new Prisma.Decimal(0);

    for (const tx of txs) {
      const iso = tx.postedAt.toISOString().slice(0, 10);
      const day = byDay.get(iso);
      if (!day) continue; // tx in the ±3 halo but outside the reported window

      const amt = new Prisma.Decimal(tx.amount);
      if (amt.isNegative()) {
        day.totalDebit = new Prisma.Decimal(day.totalDebit).plus(amt.abs()).toString();
        grandDebit = grandDebit.plus(amt.abs());
      } else if (amt.isPositive()) {
        day.totalCredit = new Prisma.Decimal(day.totalCredit).plus(amt).toString();
        grandCredit = grandCredit.plus(amt);
      }
      day.net = new Prisma.Decimal(day.net).plus(amt).toString();
      day.txCount += 1;
      day.transactions.push({
        id: tx.id,
        description: tx.description,
        amount: amt.toString(),
        category: tx.category,
        matchedPlanned: matchByTxId.get(tx.id),
      });
    }

    // Unmatched planned occurrences become ghost rows on their scheduled day.
    for (const occ of occurrences) {
      if ((occ as Occurrence & { matchedTxId?: string }).matchedTxId) continue;
      const iso = occ.date.toISOString().slice(0, 10);
      const day = byDay.get(iso);
      if (!day) continue;
      day.plannedGhosts.push({
        budgetItemId: occ.itemId,
        name: occ.name,
        categoryId: occ.categoryId,
        categoryName: occ.categoryName,
        categoryColor: occ.categoryColor,
        categoryIcon: occ.categoryIcon,
        direction: occ.direction,
        plannedAmount: occ.plannedAmount.toString(),
      });
    }

    // ------------------------------------------------------------------
    //  5) Slice each day to `topPerDay` — matched transactions and larger
    //     amounts win visibility, ghosts fill the remaining slots.
    // ------------------------------------------------------------------
    for (const day of byDay.values()) {
      // Sort transactions by |amount| DESC.
      day.transactions.sort((a, b) => {
        const aa = new Prisma.Decimal(a.amount).abs();
        const bb = new Prisma.Decimal(b.amount).abs();
        return bb.comparedTo(aa);
      });
      // Sort ghosts by plannedAmount DESC.
      day.plannedGhosts.sort((a, b) => {
        return new Prisma.Decimal(b.plannedAmount).comparedTo(new Prisma.Decimal(a.plannedAmount));
      });

      const totalEntries = day.transactions.length + day.plannedGhosts.length;
      if (totalEntries > topPerDay) {
        // Keep transactions first, then ghosts, respecting the slot count.
        const keepTx = Math.min(day.transactions.length, topPerDay);
        const keepGhost = Math.max(0, topPerDay - keepTx);
        day.overflowCount = totalEntries - keepTx - keepGhost;
        day.transactions = day.transactions.slice(0, keepTx);
        day.plannedGhosts = day.plannedGhosts.slice(0, keepGhost);
      }
    }

    return {
      from: q.from,
      to: q.to,
      days: [...byDay.values()],
      totals: {
        debit: grandDebit.toString(),
        credit: grandCredit.toString(),
        net: grandCredit.minus(grandDebit).toString(),
      },
    };
  }

  /**
   * ok  — |delta| ≤ 5% of planned
   * over — expense delta > 5% (bad) or income delta > 5% (bonus)
   * under — expense delta < -5% (savings) or income delta < -5% (miss)
   */
  private deltaStatus(direction: BudgetDirection, planned: Prisma.Decimal, actual: Prisma.Decimal): 'ok' | 'over' | 'under' {
    if (planned.isZero()) return 'ok';
    const ratio = actual.div(planned).toNumber();
    if (ratio > 1.05) return direction === 'EXPENSE' ? 'over' : 'over';
    if (ratio < 0.95) return direction === 'EXPENSE' ? 'under' : 'under';
    return 'ok';
  }
}
