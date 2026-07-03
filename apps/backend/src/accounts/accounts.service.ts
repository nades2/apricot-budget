import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all accounts for a user, optionally filtered to actifs or passifs.
   * Returns each account with its computed current balance (initial + net movements).
   */
  async findAll(userId: string, type?: AccountType) {
    const accounts = await this.prisma.account.findMany({
      where: { userId, isArchived: false, ...(type ? { type } : {}) },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    // One aggregate per account — fast because we index (account_id, posted_at).
    const totals = await this.prisma.transaction.groupBy({
      by: ['accountId'],
      where: { userId, accountId: { in: accounts.map((a) => a.id) } },
      _sum: { amount: true },
    });
    const totalByAccount = new Map(totals.map((t) => [t.accountId, t._sum.amount ?? new Prisma.Decimal(0)]));

    return accounts.map((a) => ({
      ...a,
      currentBalance: new Prisma.Decimal(a.initialBalance).plus(
        totalByAccount.get(a.id) ?? new Prisma.Decimal(0),
      ),
    }));
  }

  async findOne(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException(`Compte ${id} introuvable`);
    return account;
  }

  create(userId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        subtype: dto.subtype,
        institution: dto.institution,
        accountNumber: dto.accountNumber,
        initialBalance: dto.initialBalance ?? 0,
        currency: dto.currency ?? 'CAD',
        color: dto.color,
        icon: dto.icon,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.findOne(userId, id);
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  async archive(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.account.update({ where: { id }, data: { isArchived: true } });
  }

  /**
   * Daily balance evolution over the last `days` (inclusive of today).
   * Starts from the account's `initialBalance` plus the net of all transactions
   * strictly before the window, then walks forward day by day.
   */
  async evolution(userId: string, accountId: string, days: number) {
    const account = await this.findOne(userId, accountId);
    const to = new Date();
    to.setUTCHours(0, 0, 0, 0);
    const from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));

    // Baseline: initialBalance + sum of everything before `from`.
    const before = await this.prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { userId, accountId, postedAt: { lt: from } },
    });
    let running = new Prisma.Decimal(account.initialBalance).plus(
      before._sum.amount ?? new Prisma.Decimal(0),
    );

    // Daily net during the window, computed once via groupBy.
    const daily = await this.prisma.transaction.groupBy({
      by: ['postedAt'],
      _sum: { amount: true },
      where: { userId, accountId, postedAt: { gte: from, lte: to } },
    });
    const netByDay = new Map<string, Prisma.Decimal>();
    for (const d of daily) {
      const iso = d.postedAt.toISOString().slice(0, 10);
      netByDay.set(iso, new Prisma.Decimal(d._sum.amount ?? 0));
    }

    const points: { date: string; balance: string }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      running = running.plus(netByDay.get(iso) ?? 0);
      points.push({ date: iso, balance: running.toString() });
    }

    return {
      accountId,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      points,
    };
  }
}
