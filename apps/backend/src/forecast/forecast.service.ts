import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BudgetDirection, Prisma, ScheduledInstanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { budgetItemOccurrences } from '../budget/rrule';

// ---------------------------------------------------------------------------
//  Types de réponse — tous les Decimal sont sérialisés en string pour
//  préserver la précision côté frontend (pas de float64 sur les $).
// ---------------------------------------------------------------------------

export type ForecastEntry = {
  budgetItemId: string;
  name: string;
  categoryId: string;
  direction: BudgetDirection;
  amount: string;              // signé
  status: ScheduledInstanceStatus | 'PROJECTED';
  instanceId?: string;         // présent si l'occurrence est persistée
};

export type ForecastDay = {
  date: string;                // YYYY-MM-DD
  realizedDelta: string;       // somme des transactions réelles du jour
  projectedDelta: string;      // somme des occurrences PROJECTED non rapprochées
  netDelta: string;            // realized + projected
  balance: string;             // solde running (post-jour)
  entries: ForecastEntry[];    // occurrences projetées à afficher dans le calendrier
  belowThreshold: boolean;     // vrai si `balance < lowBalanceThreshold`
};

export type ForecastResponse = {
  accountId: string;
  currency: string;
  from: string;
  to: string;
  openingBalance: string;      // solde au jour `from - 1`
  closingBalance: string;      // solde au jour `to`
  lowBalanceThreshold: string | null;
  days: ForecastDay[];
};

// ---------------------------------------------------------------------------
//  Paramètres
// ---------------------------------------------------------------------------

const MAX_HORIZON_DAYS = 400;      // ~13 mois : marge pour "année glissante"
const DAY_MS = 86_400_000;

@Injectable()
export class ForecastService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcule la timeline de solde jour par jour pour un compte, sur [from, to].
   *
   * Algorithme :
   *   1. Charger le compte (solde initial + date d'ancrage).
   *   2. Calculer le solde d'ouverture au jour `from - 1` = initialBalance
   *      + somme des transactions réelles entre initialBalanceDate et from-1.
   *   3. Pour chaque jour dans [from, to] :
   *        - additionner les transactions réelles postées ce jour-là
   *        - additionner les occurrences PROJECTED des BudgetItem (via RRULE
   *          si présente, sinon walker enum) qui ne sont pas déjà rapprochées
   *        - le solde du jour = solde de la veille + net du jour
   *   4. Retourner la structure prête pour graphique + calendrier.
   */
  async build(
    userId: string,
    accountId: string,
    fromISO: string,
    toISO: string,
    lowBalanceThreshold?: string,
  ): Promise<ForecastResponse> {
    const from = parseIsoDate(fromISO);
    const to = parseIsoDate(toISO);
    if (from > to) throw new BadRequestException('`from` doit être ≤ `to`');
    const spanDays = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (spanDays > MAX_HORIZON_DAYS) {
      throw new BadRequestException(`Horizon max ${MAX_HORIZON_DAYS} jours`);
    }

    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: {
        id: true,
        currency: true,
        type: true,
        initialBalance: true,
        initialBalanceDate: true,
      },
    });
    if (!account) throw new NotFoundException('Compte introuvable');

    // ------------------------------------------------------------------
    //  1) Solde d'ouverture : initialBalance + toutes les transactions
    //     réelles entre `initialBalanceDate` (inclus) et `from - 1` (inclus).
    //     Pour un LIABILITY, `initialBalance` représente le solde dû
    //     (positif) et les transactions le réduisent — la convention `amount`
    //     signée sur Transaction fait déjà le travail.
    // ------------------------------------------------------------------
    const dayBefore = new Date(from.getTime() - DAY_MS);
    const priorSum = await this.prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        accountId,
        postedAt: {
          gte: account.initialBalanceDate,
          lte: dayBefore,
        },
      },
    });
    const openingBalance = new Prisma.Decimal(account.initialBalance)
      .plus(priorSum._sum.amount ?? 0);

    // ------------------------------------------------------------------
    //  2) Transactions réelles dans la fenêtre — regroupées par jour.
    // ------------------------------------------------------------------
    const txs = await this.prisma.transaction.findMany({
      where: { userId, accountId, postedAt: { gte: from, lte: to } },
      select: { postedAt: true, amount: true },
      orderBy: { postedAt: 'asc' },
    });
    const realizedByDay = new Map<string, Prisma.Decimal>();
    for (const tx of txs) {
      const iso = toISODate(tx.postedAt);
      const cur = realizedByDay.get(iso) ?? new Prisma.Decimal(0);
      realizedByDay.set(iso, cur.plus(tx.amount));
    }

    // ------------------------------------------------------------------
    //  3) Occurrences projetées.
    //     - On charge tous les BudgetItem actifs affectés à ce compte
    //       (ou sans compte spécifique — appliqués partout).
    //     - On énumère leurs occurrences dans [from, to].
    //     - On charge les ScheduledInstance persistées correspondantes pour
    //       remplacer les projections par leur statut réel (REALIZED déjà
    //       comptée via la transaction, SKIPPED/CANCELLED à ignorer).
    // ------------------------------------------------------------------
    const items = await this.prisma.budgetItem.findMany({
      where: {
        userId,
        isActive: true,
        OR: [{ accountId }, { accountId: null }],
      },
      select: {
        id: true, name: true, categoryId: true, direction: true,
        amount: true, recurrence: true, anchorDate: true, endDate: true,
        rrule: true, dtstart: true,
      },
    });

    // ScheduledInstance persistées → indexées par (itemId, date) pour override.
    const persisted = await this.prisma.scheduledInstance.findMany({
      where: {
        budgetItemId: { in: items.map((i) => i.id) },
        expectedDate: { gte: from, lte: to },
      },
      select: {
        id: true, budgetItemId: true, expectedDate: true,
        expectedAmount: true, status: true,
      },
    });
    const persistedKey = (itemId: string, date: Date) => `${itemId}#${toISODate(date)}`;
    const persistedMap = new Map(persisted.map((p) => [persistedKey(p.budgetItemId, p.expectedDate), p]));

    // Structure jour → entries + delta projeté.
    const projectedByDay = new Map<string, { delta: Prisma.Decimal; entries: ForecastEntry[] }>();

    for (const item of items) {
      const dates = budgetItemOccurrences(item, from, to);
      const signedAmount = signAmount(item.direction, item.amount);
      for (const date of dates) {
        const iso = toISODate(date);
        const override = persistedMap.get(persistedKey(item.id, date));

        // REALIZED = déjà comptée dans les transactions réelles → skip.
        // SKIPPED / CANCELLED → skip aussi.
        if (override && override.status !== 'PROJECTED') continue;

        const amount = override
          ? new Prisma.Decimal(override.expectedAmount)
          : signedAmount;

        const bucket = projectedByDay.get(iso) ?? { delta: new Prisma.Decimal(0), entries: [] };
        bucket.delta = bucket.delta.plus(amount);
        bucket.entries.push({
          budgetItemId: item.id,
          name: item.name,
          categoryId: item.categoryId,
          direction: item.direction,
          amount: amount.toString(),
          status: override?.status ?? 'PROJECTED',
          instanceId: override?.id,
        });
        projectedByDay.set(iso, bucket);
      }
    }

    // ------------------------------------------------------------------
    //  4) Assemblage jour par jour avec running balance.
    // ------------------------------------------------------------------
    const threshold = lowBalanceThreshold
      ? new Prisma.Decimal(lowBalanceThreshold)
      : null;

    const days: ForecastDay[] = [];
    let running = new Prisma.Decimal(openingBalance);

    for (let i = 0; i < spanDays; i++) {
      const d = new Date(from.getTime() + i * DAY_MS);
      const iso = toISODate(d);
      const realized = realizedByDay.get(iso) ?? new Prisma.Decimal(0);
      const bucket = projectedByDay.get(iso);
      const projected = bucket?.delta ?? new Prisma.Decimal(0);
      const net = realized.plus(projected);
      running = running.plus(net);

      days.push({
        date: iso,
        realizedDelta: realized.toString(),
        projectedDelta: projected.toString(),
        netDelta: net.toString(),
        balance: running.toString(),
        entries: bucket?.entries ?? [],
        belowThreshold: threshold ? running.lessThan(threshold) : false,
      });
    }

    return {
      accountId,
      currency: account.currency,
      from: fromISO,
      to: toISO,
      openingBalance: openingBalance.toString(),
      closingBalance: running.toString(),
      lowBalanceThreshold: threshold?.toString() ?? null,
      days,
    };
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/**
 * Applique le signe d'un BudgetItem selon sa direction, en respectant la
 * convention Transaction :
 *   EXPENSE → montant négatif
 *   INCOME  → montant positif
 * Le champ `amount` du BudgetItem est toujours positif par convention.
 */
function signAmount(direction: BudgetDirection, amount: Prisma.Decimal | string | number): Prisma.Decimal {
  const abs = new Prisma.Decimal(amount).abs();
  return direction === 'EXPENSE' ? abs.negated() : abs;
}

function parseIsoDate(iso: string): Date {
  // On veut minuit UTC pour matcher `@db.Date`.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new BadRequestException(`Date ISO invalide: ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
