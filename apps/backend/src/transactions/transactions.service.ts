import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Paginated list with optional date range and account/category filters. */
  findAll(userId: string, q: QueryTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(q.accountId ? { accountId: q.accountId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.from || q.to
        ? {
            postedAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };

    return this.prisma.transaction.findMany({
      where,
      include: { category: true, account: { select: { id: true, name: true, type: true } } },
      orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }],
      take: q.limit ?? 100,
      skip: q.offset ?? 0,
    });
  }

  async findOne(userId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { category: true, account: true, csvImport: true },
    });
    if (!tx) throw new NotFoundException(`Transaction ${id} introuvable`);
    return tx;
  }

  /** Manual entry (bouton "ad hoc"). */
  create(userId: string, dto: CreateTransactionDto) {
    return this.prisma.transaction.create({
      data: {
        userId,
        accountId: dto.accountId,
        categoryId: dto.categoryId,
        postedAt: new Date(dto.postedAt),
        description: dto.description,
        amount: dto.amount, // Prisma accepts number → Decimal
        notes: dto.notes,
        externalId: dto.externalId,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.transaction.delete({ where: { id } });
  }
}
