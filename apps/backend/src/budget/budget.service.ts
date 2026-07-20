import { Injectable, NotFoundException } from '@nestjs/common';
import { BudgetDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBudgetItemDto } from './dto/create-budget-item.dto';
import { UpdateBudgetItemDto } from './dto/update-budget-item.dto';
import { BUDGET_PRESETS, BudgetPreset } from './presets';
import { occurrencesInMonth } from './recurrence';

/**
 * A single line in the monthly report.
 */
export type BudgetLine = {
  itemId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  direction: BudgetDirection;
  amountPerOccurrence: string;
  occurrences: number;
  planned: string;
  actual: string;
  variance: string;                 // actual - planned (signed the same way for both directions)
  status: 'ok' | 'over' | 'under' | 'missing';
};

export type BudgetReport = {
  month: string;                    // YYYY-MM
  from: string;
  to: string;
  income: {
    planned: string;
    actual: string;
    lines: BudgetLine[];
  };
  expense: {
    planned: string;
    actual: string;
    lines: BudgetLine[];
  };
  net: {
    planned: string;                // income.planned - expense.planned
    actual: string;                 // income.actual - expense.actual
    variance: string;               // actual - planned
    verdict: 'positive' | 'negative' | 'neutral';
  };
};

@Injectable()
export class BudgetService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- CRUD ---------------------------------------------------------------

  listItems(userId: string) {
    return this.prisma.budgetItem.findMany({
      where: { userId },
      include: { category: true, account: { select: { id: true, name: true } } },
      orderBy: [{ direction: 'asc' }, { name: 'asc' }],
    });
  }

  createItem(userId: string, dto: CreateBudgetItemDto) {
    return this.prisma.budgetItem.create({
      data: {
        userId,
        categoryId: dto.categoryId,
        accountId: dto.accountId,
        name: dto.name,
        direction: dto.direction,
        amount: new Prisma.Decimal(dto.amount),
        recurrence: dto.recurrence,
        anchorDate: new Date(dto.anchorDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        notes: dto.notes,
      },
    });
  }

  async updateItem(userId: string, id: string, dto: UpdateBudgetItemDto) {
    await this.assertOwned(userId, id);
    const data: Prisma.BudgetItemUpdateInput = { ...dto };
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.anchorDate) data.anchorDate = new Date(dto.anchorDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    return this.prisma.budgetItem.update({ where: { id }, data });
  }

  async removeItem(userId: string, id: string) {
    await this.assertOwned(userId, id);
    return this.prisma.budgetItem.delete({ where: { id } });
  }

  private async assertOwned(userId: string, id: string) {
    const found = await this.prisma.budgetItem.findFirst({ where: { id, userId } });
    if (!found) throw new NotFoundException(`Poste ${id} introuvable`);
  }

  // ---- Presets ------------------------------------------------------------

  async presets(userId: string): Promise<(BudgetPreset & { categoryId: string | null })[]> {
    const categories = await this.prisma.category.findMany({
      where: { OR: [{ userId }, { userId: null }] },
      select: { id: true, slug: true },
    });
    const bySlug = new Map(categories.map((c) => [c.slug.toLowerCase(), c.id]));
    return BUDGET_PRESETS.map((p) => ({
      ...p,
      categoryId: bySlug.get(p.categorySlug) ?? null,
    }));
  }

  // ---- Monthly report -----------------------------------------------------

  /**
   * Build the "planned vs actual" report for a month (YYYY-MM).
   * Correlation is automatic by category — every transaction whose category
   * matches a budget item's category, in the window, is summed into that item.
   */
  async monthlyReport(userId: string, month: string): Promise<BudgetReport> {
    const monthStart = new Date(`${month}-01T00:00:00Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
    monthEnd.setUTCDate(0); // last day of month

    const items = await this.prisma.budgetItem.findMany({
      where: { userId, isActive: true },
      include: { category: true },
    });

    // Aggregate actuals per (categoryId, direction) in one query.
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        userId,
        postedAt: { gte: monthStart, lte: monthEnd },
        categoryId: { in: items.map((i) => i.categoryId) },
      },
      _sum: { amount: true },
    });
    // Split each category total into positive (income) and negative (expense).
    const actualIncomeByCat = new Map<string, Prisma.Decimal>();
    const actualExpenseByCat = new Map<string, Prisma.Decimal>();
    for (const r of rows) {
      if (!r.categoryId) continue;
      const sum = r._sum.amount ?? new Prisma.Decimal(0);
      // We need the sign breakdown; groupBy on amount alone gives net.
      // Redo a per-category split — small N, fine.
    }
    // Redo with sign-aware aggregation (cheap; we already have the category ids).
    // Phase 6.1 : exclut les transactions marquées comme transferts (paiement CC,
    // virement inter-comptes). Ces mouvements ne représentent pas de vraies
    // dépenses/revenus catégoriels et gonfleraient artificiellement les
    // "actuals" d'une catégorie comme "Paiement carte de crédit".
    for (const item of items) {
      // Skip if we already computed this category.
      if (
        (item.direction === 'INCOME'  && actualIncomeByCat.has(item.categoryId)) ||
        (item.direction === 'EXPENSE' && actualExpenseByCat.has(item.categoryId))
      ) continue;
      const [posAgg, negAgg] = await Promise.all([
        this.prisma.transaction.aggregate({
          _sum: { amount: true },
          where: {
            userId,
            categoryId: item.categoryId,
            postedAt: { gte: monthStart, lte: monthEnd },
            amount: { gt: 0 },
            linkedTransactionId: null,
          },
        }),
        this.prisma.transaction.aggregate({
          _sum: { amount: true },
          where: {
            userId,
            categoryId: item.categoryId,
            postedAt: { gte: monthStart, lte: monthEnd },
            amount: { lt: 0 },
            linkedTransactionId: null,
          },
        }),
      ]);
      actualIncomeByCat.set(item.categoryId, posAgg._sum.amount ?? new Prisma.Decimal(0));
      // Store as positive absolute for expense display.
      actualExpenseByCat.set(item.categoryId, (negAgg._sum.amount ?? new Prisma.Decimal(0)).abs());
    }

    const incomeLines: BudgetLine[] = [];
    const expenseLines: BudgetLine[] = [];

    for (const item of items) {
      const occ = occurrencesInMonth(item.recurrence, item.anchorDate, item.endDate, monthStart, monthEnd);
      const planned = new Prisma.Decimal(item.amount).mul(occ);
      const actual = item.direction === 'INCOME'
        ? actualIncomeByCat.get(item.categoryId) ?? new Prisma.Decimal(0)
        : actualExpenseByCat.get(item.categoryId) ?? new Prisma.Decimal(0);

      const variance = actual.minus(planned);
      const status = this.statusFor(item.direction, planned, actual);

      const line: BudgetLine = {
        itemId: item.id,
        name: item.name,
        categoryId: item.categoryId,
        categoryName: item.category.name,
        categoryColor: item.category.color,
        categoryIcon: item.category.icon,
        direction: item.direction,
        amountPerOccurrence: new Prisma.Decimal(item.amount).toString(),
        occurrences: occ,
        planned: planned.toString(),
        actual: actual.toString(),
        variance: variance.toString(),
        status,
      };
      (item.direction === 'INCOME' ? incomeLines : expenseLines).push(line);
    }

    const incomePlanned = incomeLines.reduce((s, l) => s.plus(new Prisma.Decimal(l.planned)), new Prisma.Decimal(0));
    const incomeActual = incomeLines.reduce((s, l) => s.plus(new Prisma.Decimal(l.actual)), new Prisma.Decimal(0));
    const expensePlanned = expenseLines.reduce((s, l) => s.plus(new Prisma.Decimal(l.planned)), new Prisma.Decimal(0));
    const expenseActual = expenseLines.reduce((s, l) => s.plus(new Prisma.Decimal(l.actual)), new Prisma.Decimal(0));

    const netPlanned = incomePlanned.minus(expensePlanned);
    const netActual = incomeActual.minus(expenseActual);
    const netVariance = netActual.minus(netPlanned);
    const verdict = netActual.gt(0) ? 'positive' : netActual.lt(0) ? 'negative' : 'neutral';

    return {
      month,
      from: monthStart.toISOString().slice(0, 10),
      to: monthEnd.toISOString().slice(0, 10),
      income:  { planned: incomePlanned.toString(),  actual: incomeActual.toString(),  lines: incomeLines },
      expense: { planned: expensePlanned.toString(), actual: expenseActual.toString(), lines: expenseLines },
      net: {
        planned: netPlanned.toString(),
        actual: netActual.toString(),
        variance: netVariance.toString(),
        verdict,
      },
    };
  }

  /**
   * Traffic-light status:
   *   Expense — under=green, ok=green, over=red.
   *   Income  — under=red (didn't hit target), over=green.
   *   No occurrence but item exists → 'missing'.
   */
  private statusFor(direction: BudgetDirection, planned: Prisma.Decimal, actual: Prisma.Decimal): BudgetLine['status'] {
    if (planned.isZero()) return actual.isZero() ? 'ok' : 'over';
    const ratio = actual.div(planned).toNumber();
    if (direction === 'EXPENSE') {
      if (actual.isZero()) return 'missing';
      if (ratio > 1.05) return 'over';
      if (ratio < 0.5) return 'under';
      return 'ok';
    }
    // INCOME
    if (actual.isZero()) return 'missing';
    if (ratio < 0.95) return 'under';
    return 'ok';
  }
}
