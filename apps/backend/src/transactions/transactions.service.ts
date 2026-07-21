import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { UpdateSplitsDto } from './dto/update-splits.dto';
import { LinkTransferDto } from './dto/link-transfer.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

/**
 * Fenêtre de tolérance en jours pour lier deux transactions comme paire de
 * transfert. Un paiement de carte de crédit prend souvent 1-3 jours ouvrables
 * pour être crédité sur la carte après le débit du compte-chèques ; ±7 laisse
 * de la marge sans être laxiste.
 */
const TRANSFER_WINDOW_DAYS = 7;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Paginated list with optional date range and account/category filters. */
  findAll(userId: string, q: QueryTransactionsDto) {
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(q.accountId ? { accountId: q.accountId } : {}),
      // uncategorized=true a priorité sur categoryId (mutuellement exclusifs
      // sémantiquement mais on tranche défensivement).
      ...(q.uncategorized
        ? { categoryId: null }
        : q.categoryId
          ? { categoryId: q.categoryId }
          : {}),
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

  /**
   * Lie deux transactions comme paire de transfert (ex. paiement CC :
   * -500$ sur chèques ↔ +500$ sur la carte). Une fois liées, les deux
   * transactions ne comptent plus dans les rapports catégoriels — elles
   * représentent un simple mouvement d'argent entre comptes.
   *
   * Validations strictes :
   *   - source et cible existent et appartiennent au user
   *   - comptes différents (pas de "transfert" vers soi-même)
   *   - montants de magnitudes égales et de signes opposés
   *   - dates dans la fenêtre TRANSFER_WINDOW_DAYS
   *   - aucune des deux n'est déjà liée à autre chose
   */
  async linkAsTransfer(userId: string, sourceId: string, dto: LinkTransferDto) {
    if (sourceId === dto.targetTransactionId) {
      throw new BadRequestException('Une transaction ne peut être liée à elle-même.');
    }

    const [source, target] = await Promise.all([
      this.prisma.transaction.findFirst({
        where: { id: sourceId, userId },
        select: { id: true, accountId: true, amount: true, postedAt: true, linkedTransactionId: true },
      }),
      this.prisma.transaction.findFirst({
        where: { id: dto.targetTransactionId, userId },
        select: { id: true, accountId: true, amount: true, postedAt: true, linkedTransactionId: true },
      }),
    ]);

    if (!source) throw new NotFoundException(`Transaction ${sourceId} introuvable`);
    if (!target) throw new NotFoundException(`Transaction ${dto.targetTransactionId} introuvable`);

    if (source.accountId === target.accountId) {
      throw new BadRequestException('Un transfert doit relier deux comptes différents.');
    }

    const srcAmount = new Prisma.Decimal(source.amount);
    const tgtAmount = new Prisma.Decimal(target.amount);
    // Montants de magnitudes égales et signes opposés = leur somme est zéro.
    if (!srcAmount.plus(tgtAmount).isZero()) {
      throw new BadRequestException(
        `Montants incompatibles : ${srcAmount.toString()} et ${tgtAmount.toString()} ne s'annulent pas.`,
      );
    }

    // Fenêtre de dates
    const diffDays = Math.abs(
      (source.postedAt.getTime() - target.postedAt.getTime()) / 86_400_000,
    );
    if (diffDays > TRANSFER_WINDOW_DAYS) {
      throw new BadRequestException(
        `Les deux transactions doivent être à ±${TRANSFER_WINDOW_DAYS} jours (${diffDays.toFixed(0)}j de différence).`,
      );
    }

    // Aucune n'est déjà liée (à autre chose que sa contrepartie visée).
    if (source.linkedTransactionId && source.linkedTransactionId !== target.id) {
      throw new ConflictException(
        `Transaction source déjà liée à ${source.linkedTransactionId} — délie-la d'abord.`,
      );
    }
    if (target.linkedTransactionId && target.linkedTransactionId !== source.id) {
      throw new ConflictException(
        `Transaction cible déjà liée à ${target.linkedTransactionId} — délie-la d'abord.`,
      );
    }

    // Écriture atomique des deux côtés.
    return this.prisma.$transaction(async (client) => {
      await client.transaction.update({
        where: { id: source.id },
        data: { linkedTransactionId: target.id },
      });
      await client.transaction.update({
        where: { id: target.id },
        data: { linkedTransactionId: source.id },
      });
      return {
        source: await client.transaction.findUnique({
          where: { id: source.id },
          include: {
            account: { select: { id: true, name: true, type: true } },
            linkedTransaction: {
              select: { id: true, description: true, amount: true, postedAt: true, accountId: true },
            },
          },
        }),
        target: await client.transaction.findUnique({
          where: { id: target.id },
          include: {
            account: { select: { id: true, name: true, type: true } },
            linkedTransaction: {
              select: { id: true, description: true, amount: true, postedAt: true, accountId: true },
            },
          },
        }),
      };
    });
  }

  /**
   * Délie une transaction de sa contrepartie. Nettoie les deux côtés
   * atomiquement pour préserver l'invariance de symétrie.
   */
  /**
   * Scanne les transactions d'un utilisateur et lie automatiquement les paires
   * de transfert détectables.
   *
   * Critère de détection strict (Phase 5) :
   *   - les deux transactions sont catégorisées "Paiement carte de crédit"
   *     (slug système `paiement-carte-credit`)
   *   - dans des comptes différents
   *   - montants de magnitude égale et signes opposés (leur somme = 0)
   *   - dates à ±3 jours
   *   - aucune des deux n'est déjà liée
   *
   * Un candidat qui matche exactement UNE contrepartie est lié automatiquement.
   * 0 candidats → silencieux (rien à faire). 2+ candidats → laissé au user
   * pour arbitrage manuel (retourné dans `ambiguous`).
   *
   * @param scope
   *   - `all` : parcourt tout l'historique de l'utilisateur (utilisé par le
   *     one-shot de migration).
   *   - `since` + `sinceDate` : ne considère que les transactions à partir de
   *     cette date (utilisé lors du confirm d'un import CSV).
   */
  async detectAndLinkTransfers(
    userId: string,
    scope: { mode: 'all' } | { mode: 'since'; sinceDate: Date } = { mode: 'all' },
  ): Promise<{
    linked: Array<{ sourceId: string; targetId: string; amount: string; date: string }>;
    ambiguous: Array<{ txId: string; description: string; candidateCount: number }>;
  }> {
    // 1) Trouver la catégorie "Paiement carte de crédit" (système, seedée).
    const ccCategory = await this.prisma.category.findFirst({
      where: { slug: 'paiement-carte-credit', OR: [{ userId }, { userId: null }] },
      select: { id: true },
    });
    if (!ccCategory) {
      return { linked: [], ambiguous: [] };
    }

    // 2) Charger toutes les transactions non-liées catégorisées CC-payment
    //    dans le scope demandé.
    const candidates = await this.prisma.transaction.findMany({
      where: {
        userId,
        categoryId: ccCategory.id,
        linkedTransactionId: null,
        ...(scope.mode === 'since' ? { postedAt: { gte: scope.sinceDate } } : {}),
      },
      select: {
        id: true,
        accountId: true,
        amount: true,
        postedAt: true,
        description: true,
      },
      orderBy: { postedAt: 'asc' },
    });

    if (candidates.length < 2) return { linked: [], ambiguous: [] };

    const windowMs = 3 * 86_400_000;
    const linked: Array<{ sourceId: string; targetId: string; amount: string; date: string }> = [];
    const ambiguous: Array<{ txId: string; description: string; candidateCount: number }> = [];
    const consumed = new Set<string>();

    for (const a of candidates) {
      if (consumed.has(a.id)) continue;
      const aAmt = new Prisma.Decimal(a.amount);

      // Cherche les candidats miroirs parmi les autres.
      const matches = candidates.filter((b) => {
        if (b.id === a.id) return false;
        if (consumed.has(b.id)) return false;
        if (b.accountId === a.accountId) return false;
        // amounts must sum to zero
        if (!new Prisma.Decimal(b.amount).plus(aAmt).isZero()) return false;
        const diff = Math.abs(b.postedAt.getTime() - a.postedAt.getTime());
        return diff <= windowMs;
      });

      if (matches.length === 1) {
        const b = matches[0];
        // Écriture atomique de la paire.
        await this.prisma.$transaction(async (client) => {
          await client.transaction.update({
            where: { id: a.id },
            data: { linkedTransactionId: b.id },
          });
          await client.transaction.update({
            where: { id: b.id },
            data: { linkedTransactionId: a.id },
          });
        });
        consumed.add(a.id);
        consumed.add(b.id);
        linked.push({
          sourceId: a.id,
          targetId: b.id,
          amount: aAmt.toString(),
          date: a.postedAt.toISOString().slice(0, 10),
        });
      } else if (matches.length >= 2) {
        ambiguous.push({
          txId: a.id,
          description: a.description,
          candidateCount: matches.length,
        });
      }
      // 0 matches : rien à faire, on continue.
    }

    return { linked, ambiguous };
  }

  async unlinkTransfer(userId: string, txId: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: txId, userId },
      select: { id: true, linkedTransactionId: true },
    });
    if (!tx) throw new NotFoundException(`Transaction ${txId} introuvable`);
    if (!tx.linkedTransactionId) {
      throw new BadRequestException(`Transaction ${txId} n'est pas liée à un transfert.`);
    }
    const partnerId = tx.linkedTransactionId;

    return this.prisma.$transaction(async (client) => {
      await client.transaction.update({
        where: { id: tx.id },
        data: { linkedTransactionId: null },
      });
      await client.transaction.update({
        where: { id: partnerId },
        data: { linkedTransactionId: null },
      });
      return { unlinked: [tx.id, partnerId] };
    });
  }
}
