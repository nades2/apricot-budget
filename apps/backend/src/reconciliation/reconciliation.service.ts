import { Injectable, Logger } from '@nestjs/common';
import { BudgetDirection, Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { budgetItemOccurrences } from '../budget/rrule';

/**
 * Client Prisma "quelconque" — soit le service principal, soit le client
 * transactionnel passé par $transaction. Permet d'appeler reconcile() aussi
 * bien en standalone qu'à l'intérieur d'une transaction CSV.
 */
export type PrismaLike = PrismaClient | Prisma.TransactionClient;

// Fenêtre de tolérance pour matcher une occurrence à une transaction réelle.
// Aligné sur CalendarService.MATCH_WINDOW_DAYS pour rester cohérent visuellement.
const MATCH_WINDOW_DAYS = 3;
// Tolérance sur le montant : 5% par défaut. La fiabilité du montant est déjà
// contrôlée en amont par la RRULE + confidence du BudgetItem.
const AMOUNT_TOLERANCE = 0.05;

export type ReconcileResult = {
  matched: number;         // nb de ScheduledInstance créées avec status REALIZED
  skipped: number;         // occurrences sans transaction candidate
  windowFrom: string;
  windowTo: string;
};

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rapproche les transactions réelles avec les occurrences BudgetItem
   * dans la fenêtre [from, to]. Pour chaque occurrence sans ScheduledInstance
   * existante, cherche la meilleure transaction candidate ; en cas de match,
   * crée une ScheduledInstance REALIZED liée à cette transaction.
   *
   * Idempotent : ré-exécuter n'importe combien de fois donne le même résultat
   * grâce aux contraintes UNIQUE sur (budget_item_id, expected_date) et
   * matched_transaction_id.
   */
  async reconcile(
    userId: string,
    opts: {
      accountId?: string;
      from: Date;
      to: Date;
      /** Client Prisma à utiliser — par défaut le service principal.
       *  Injecter ici le tx passé par $transaction pour rester atomique. */
      client?: PrismaLike;
    },
  ): Promise<ReconcileResult> {
    const db = opts.client ?? this.prisma;
    const from = normalizeDate(opts.from);
    const to = normalizeDate(opts.to);

    // ------------------------------------------------------------------
    //  1) BudgetItem actifs pour ce user, filtrés éventuellement par compte.
    // ------------------------------------------------------------------
    const items = await db.budgetItem.findMany({
      where: {
        userId,
        isActive: true,
        ...(opts.accountId
          ? { OR: [{ accountId: opts.accountId }, { accountId: null }] }
          : {}),
      },
      select: {
        id: true, direction: true, amount: true,
        recurrence: true, anchorDate: true, endDate: true,
        rrule: true, dtstart: true,
      },
    });

    if (items.length === 0) {
      return { matched: 0, skipped: 0, windowFrom: toISODate(from), windowTo: toISODate(to) };
    }

    // ------------------------------------------------------------------
    //  2) Enumération des occurrences dans [from, to].
    // ------------------------------------------------------------------
    type Occ = {
      budgetItemId: string;
      date: Date;
      direction: BudgetDirection;
      expectedAmount: Prisma.Decimal;   // signé
    };
    const occurrences: Occ[] = [];
    for (const item of items) {
      const dates = budgetItemOccurrences(item, from, to);
      const signed = item.direction === 'EXPENSE'
        ? new Prisma.Decimal(item.amount).abs().negated()
        : new Prisma.Decimal(item.amount).abs();
      for (const d of dates) {
        occurrences.push({
          budgetItemId: item.id,
          date: d,
          direction: item.direction,
          expectedAmount: signed,
        });
      }
    }

    if (occurrences.length === 0) {
      return { matched: 0, skipped: 0, windowFrom: toISODate(from), windowTo: toISODate(to) };
    }

    // ------------------------------------------------------------------
    //  3) ScheduledInstance déjà persistées → on ne rappproche pas ces jours-là.
    // ------------------------------------------------------------------
    const existing = await db.scheduledInstance.findMany({
      where: {
        budgetItemId: { in: items.map((i) => i.id) },
        expectedDate: { gte: from, lte: to },
      },
      select: { budgetItemId: true, expectedDate: true, matchedTransactionId: true },
    });
    const skipKeys = new Set<string>();
    const alreadyMatchedTxIds = new Set<string>();
    for (const e of existing) {
      skipKeys.add(instanceKey(e.budgetItemId, e.expectedDate));
      if (e.matchedTransactionId) alreadyMatchedTxIds.add(e.matchedTransactionId);
    }

    // ------------------------------------------------------------------
    //  4) Transactions candidates — fenêtre élargie de MATCH_WINDOW_DAYS
    //     de chaque côté pour tolérer un décalage bancaire.
    // ------------------------------------------------------------------
    const fetchFrom = addDays(from, -MATCH_WINDOW_DAYS);
    const fetchTo = addDays(to, MATCH_WINDOW_DAYS);
    const txs = await db.transaction.findMany({
      where: {
        userId,
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
        postedAt: { gte: fetchFrom, lte: fetchTo },
      },
      select: { id: true, postedAt: true, amount: true },
    });

    // Une transaction ne peut satisfaire qu'une occurrence. On tient un set
    // des IDs déjà consommés, alimenté par les instances existantes puis par
    // les nouveaux matches du run.
    const consumedTx = new Set<string>(alreadyMatchedTxIds);

    // ------------------------------------------------------------------
    //  5) Matching gourmand — chronologique, meilleure candidate par occ.
    // ------------------------------------------------------------------
    // Trier les occurrences par date pour un ordre déterministe.
    occurrences.sort((a, b) => a.date.getTime() - b.date.getTime());

    let matchedCount = 0;
    let skippedCount = 0;

    for (const occ of occurrences) {
      if (skipKeys.has(instanceKey(occ.budgetItemId, occ.date))) continue;

      const winStart = addDays(occ.date, -MATCH_WINDOW_DAYS);
      const winEnd = addDays(occ.date, MATCH_WINDOW_DAYS);
      const expectedAbs = occ.expectedAmount.abs();
      const tolerance = expectedAbs.mul(AMOUNT_TOLERANCE);

      // Filtrer les candidates : bon compte, bonne fenêtre, bonne direction,
      // amount |actual - expected| <= tolerance, non déjà consommée.
      const candidates = txs.filter((tx) => {
        if (consumedTx.has(tx.id)) return false;
        if (tx.postedAt < winStart || tx.postedAt > winEnd) return false;
        const amt = new Prisma.Decimal(tx.amount);
        if (occ.direction === 'EXPENSE' ? !amt.isNegative() : !amt.isPositive()) return false;
        const diff = amt.abs().minus(expectedAbs).abs();
        return diff.lessThanOrEqualTo(tolerance);
      });

      if (candidates.length === 0) {
        skippedCount++;
        continue;
      }

      // Best = date la plus proche, puis montant le plus proche.
      candidates.sort((a, b) => {
        const dA = Math.abs(a.postedAt.getTime() - occ.date.getTime());
        const dB = Math.abs(b.postedAt.getTime() - occ.date.getTime());
        if (dA !== dB) return dA - dB;
        const aA = new Prisma.Decimal(a.amount).abs().minus(expectedAbs).abs();
        const aB = new Prisma.Decimal(b.amount).abs().minus(expectedAbs).abs();
        return aA.comparedTo(aB);
      });
      const best = candidates[0];

      // Créer la ScheduledInstance REALIZED. Le CHECK contrainte SQL exige
      // matched_transaction_id NOT NULL quand status=REALIZED — respecté.
      await db.scheduledInstance.create({
        data: {
          budgetItemId: occ.budgetItemId,
          expectedDate: occ.date,
          expectedAmount: occ.expectedAmount,
          status: 'REALIZED',
          matchedTransactionId: best.id,
        },
      });

      consumedTx.add(best.id);
      skipKeys.add(instanceKey(occ.budgetItemId, occ.date));
      matchedCount++;
    }

    this.logger.log(
      `Reconciliation user=${userId} account=${opts.accountId ?? 'ALL'} ` +
      `window=${toISODate(from)}..${toISODate(to)} matched=${matchedCount} skipped=${skippedCount}`,
    );

    return {
      matched: matchedCount,
      skipped: skippedCount,
      windowFrom: toISODate(from),
      windowTo: toISODate(to),
    };
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function instanceKey(itemId: string, date: Date): string {
  return `${itemId}#${toISODate(date)}`;
}

function normalizeDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
