import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpdateSplitsDto } from './dto/update-splits.dto';
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
      include: {
        category: true,
        account: { select: { id: true, name: true, type: true } },
        splits: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { category: { select: { id: true, name: true, icon: true, color: true, direction: true } } },
        },
      },
      orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }],
      take: q.limit ?? 100,
      skip: q.offset ?? 0,
    });
  }

  async findOne(userId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        category: true,
        account: true,
        csvImport: true,
        splits: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { category: { select: { id: true, name: true, icon: true, color: true, direction: true } } },
        },
      },
    });
    if (!tx) throw new NotFoundException(`Transaction ${id} introuvable`);
    return tx;
  }

  /**
   * Manual entry (bouton "ad hoc").
   *
   * Phase 1 note: on écrit systématiquement 1 split miroir du couple
   * (categoryId, amount) — les lectures continuent d'utiliser
   * `transaction.categoryId`, mais la table `transaction_splits` reste
   * toujours synchrone, prête pour la Phase 2.
   */
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
        splits: {
          create: [{
            categoryId: dto.categoryId ?? null,
            amount: dto.amount,
            sortOrder: 0,
          }],
        },
      },
    });
  }

  /**
   * Modifier une transaction existante — pour l instant se limite a
   * categoryId et notes. Verifie que la transaction appartient au user.
   *
   * Phase 1 note: quand `categoryId` change, on garde le split (unique en
   * Phase 1) en cohérence via la même transaction Prisma.
   */
  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const existing = await this.findOne(userId, id);

    // Si categoryId est fourni ET non null, verifier qu elle appartient au
    // user (ou est systeme) — evite les fuites cross-tenant.
    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({
        where: {
          id: dto.categoryId,
          OR: [{ userId }, { userId: null }],
        },
      });
      if (!cat) throw new NotFoundException(`Categorie ${dto.categoryId} invalide`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id },
        data: {
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: { category: true, account: { select: { id: true, name: true, type: true } } },
      });

      // Synchroniser la ou les lignes de split avec le nouveau categoryId.
      // En Phase 1 chaque transaction a exactement 1 split (garanti par le
      // backfill et par create()). Si un jour un split multiple est présent,
      // on ne le casse pas — on ne touche PAS aux splits (l'utilisateur devra
      // passer par l'API de split pour re-classer). Ce cas n'existe pas
      // encore en Phase 1 mais on prévoit défensivement.
      if (dto.categoryId !== undefined) {
        const splits = await tx.transactionSplit.findMany({
          where: { transactionId: id },
          select: { id: true },
        });
        if (splits.length === 1) {
          await tx.transactionSplit.update({
            where: { id: splits[0].id },
            data: { categoryId: dto.categoryId },
          });
        }
        // Si 0 splits: incohérence héritée. Créer 1 miroir pour rattraper.
        if (splits.length === 0) {
          await tx.transactionSplit.create({
            data: {
              transactionId: id,
              categoryId: dto.categoryId,
              amount: existing.amount,
              sortOrder: 0,
            },
          });
        }
        // Si >1 splits: on ne touche à rien — la source de vérité est la
        // table splits, l'utilisateur doit passer par l'API dédiée.
      }

      return updated;
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.transaction.delete({ where: { id } });
  }

  /**
   * Replace the split lines of a transaction atomically.
   *
   * Validation (all strict):
   *   - user owns the transaction
   *   - sum of split amounts == transaction.amount (exact Decimal equality)
   *   - every split has the same sign as the parent (no mixed-sign in Phase 2)
   *   - every categoryId (when set) belongs to the user or is a system category
   *
   * Side effect: transaction.categoryId is synced to the FIRST split's
   * categoryId. This keeps the legacy single-category reads coherent while
   * the calendar/reports still consume `transaction.categoryId` (Phase 2 does
   * not yet flip those reads over to splits).
   */
  async replaceSplits(userId: string, txId: string, dto: UpdateSplitsDto) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: txId, userId },
      select: { id: true, amount: true },
    });
    if (!tx) throw new NotFoundException(`Transaction ${txId} introuvable`);

    if (dto.splits.length === 0) {
      throw new BadRequestException('Au moins un split est requis.');
    }

    const parentAmount = new Prisma.Decimal(tx.amount);
    const parentSign = parentAmount.isNegative() ? -1 : parentAmount.isPositive() ? 1 : 0;

    // --- Sign check + running sum ---
    let sum = new Prisma.Decimal(0);
    for (const [i, s] of dto.splits.entries()) {
      const amt = new Prisma.Decimal(s.amount);
      if (amt.isZero()) {
        throw new BadRequestException(`Split #${i + 1} : montant nul interdit.`);
      }
      const sign = amt.isNegative() ? -1 : 1;
      if (parentSign !== 0 && sign !== parentSign) {
        throw new BadRequestException(
          `Split #${i + 1} : signe (${sign > 0 ? '+' : '-'}) incompatible avec le montant parent (${parentAmount.toString()}).`,
        );
      }
      sum = sum.plus(amt);
    }

    if (!sum.equals(parentAmount)) {
      throw new BadRequestException(
        `Somme des splits (${sum.toString()}) ≠ montant transaction (${parentAmount.toString()}).`,
      );
    }

    // --- Category ownership check (batched query) ---
    const catIds = Array.from(
      new Set(dto.splits.map((s) => s.categoryId).filter((v): v is string => !!v)),
    );
    if (catIds.length > 0) {
      const owned = await this.prisma.category.findMany({
        where: {
          id: { in: catIds },
          OR: [{ userId }, { userId: null }],
        },
        select: { id: true },
      });
      if (owned.length !== catIds.length) {
        const ownedSet = new Set(owned.map((c) => c.id));
        const missing = catIds.filter((id) => !ownedSet.has(id));
        throw new BadRequestException(`Catégories invalides : ${missing.join(', ')}`);
      }
    }

    // --- Atomic replace ---
    return this.prisma.$transaction(async (client) => {
      await client.transactionSplit.deleteMany({ where: { transactionId: txId } });

      await client.transactionSplit.createMany({
        data: dto.splits.map((s, i) => ({
          transactionId: txId,
          categoryId: s.categoryId ?? null,
          amount: s.amount,
          notes: s.notes ?? null,
          sortOrder: s.sortOrder ?? i,
        })),
      });

      // Keep the legacy `transaction.categoryId` denormalized to the first
      // split's category so reads that don't (yet) consume splits stay
      // coherent. Sort by sortOrder to pick the "primary" line stably.
      const primary = [...dto.splits]
        .map((s, i) => ({ ...s, sortOrder: s.sortOrder ?? i }))
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];

      return client.transaction.update({
        where: { id: txId },
        data: { categoryId: primary.categoryId ?? null },
        include: {
          category: true,
          account: { select: { id: true, name: true, type: true } },
          splits: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: { category: { select: { id: true, name: true, icon: true, color: true, direction: true } } },
          },
        },
      });
    });
  }
}
