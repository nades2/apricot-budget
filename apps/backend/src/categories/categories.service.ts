import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All categories visible to a user: system categories + user's own. */
  findAllVisibleTo(userId: string) {
    return this.prisma.category.findMany({
      where: { OR: [{ userId: null }, { userId }] },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Compte les dépendances d'une catégorie (transactions, splits, budget
   * items, mapping rules). Utilisé par le frontend pour piloter le flow de
   * suppression : si tout est à zéro on peut delete direct, sinon proposer
   * la réassignation via mergeInto.
   */
  async usageCounts(userId: string, id: string) {
    // Vérifie d'abord l'ownership (system ou user).
    await this.findOne(userId, id);
    const [transactions, splits, budgetItems, mappingRules] = await Promise.all([
      this.prisma.transaction.count({ where: { userId, categoryId: id } }),
      this.prisma.transactionSplit.count({
        where: { categoryId: id, transaction: { userId } },
      }),
      this.prisma.budgetItem.count({ where: { userId, categoryId: id } }),
      this.prisma.csvMappingRule.count({ where: { userId, categoryId: id } }),
    ]);
    return { transactions, splits, budgetItems, mappingRules };
  }

  findOne(userId: string, id: string) {
    return this.prisma.category
      .findFirst({
        where: { id, OR: [{ userId: null }, { userId }] },
      })
      .then((c) => {
        if (!c) throw new NotFoundException(`Catégorie ${id} introuvable`);
        return c;
      });
  }

  create(userId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        userId,
        name: dto.name,
        slug: dto.slug ?? this.slugify(dto.name),
        direction: dto.direction,
        icon: dto.icon,
        color: dto.color,
        sortOrder: dto.sortOrder ?? 500,
        isSystem: false,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { id, userId }, // only user's own — system categories are locked
    });
    if (!existing) throw new NotFoundException(`Catégorie ${id} introuvable ou non modifiable`);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.category.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException(`Catégorie ${id} introuvable ou non supprimable`);
    return this.prisma.category.delete({ where: { id } });
  }

  /**
   * Fusionne toutes les références d'une catégorie source vers une cible,
   * puis supprime la source. Atomique.
   *
   * Transferts effectués :
   *   - transactions.categoryId : source → target
   *   - transaction_splits.categoryId : source → target
   *   - budget_items.categoryId : source → target (permet de supprimer même
   *     si la source a un budget item — FK Restrict aurait bloqué le delete)
   *   - csv_mapping_rules.categoryId : source → target (mais si une règle
   *     avec la même clé unique existe déjà sur la cible, on skip la source
   *     et la laisse être supprimée en cascade)
   *
   * Validations :
   *   - source doit appartenir au user (pas de suppression des catégories système)
   *   - target doit être visible par le user (soit sienne, soit système)
   *   - source ≠ target (no-op refusé pour éviter perte accidentelle)
   */
  async mergeInto(userId: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) {
      throw new BadRequestException('La source et la cible doivent être différentes.');
    }

    const source = await this.prisma.category.findFirst({
      where: { id: sourceId, userId },
    });
    if (!source) {
      throw new NotFoundException(
        `Catégorie source ${sourceId} introuvable ou non modifiable (les catégories système ne peuvent pas être supprimées).`,
      );
    }

    const target = await this.prisma.category.findFirst({
      where: { id: targetId, OR: [{ userId }, { userId: null }] },
    });
    if (!target) throw new NotFoundException(`Catégorie cible ${targetId} introuvable`);

    return this.prisma.$transaction(async (client) => {
      // 1. Transactions (Prisma génère un UPDATE ... WHERE category_id = ...)
      const txUpdated = await client.transaction.updateMany({
        where: { userId, categoryId: sourceId },
        data: { categoryId: targetId },
      });

      // 2. Splits — restreints aux transactions du user via la relation.
      const splitsUpdated = await client.transactionSplit.updateMany({
        where: { categoryId: sourceId, transaction: { userId } },
        data: { categoryId: targetId },
      });

      // 3. Budget items — nécessaire pour lever la contrainte FK Restrict.
      const budgetUpdated = await client.budgetItem.updateMany({
        where: { userId, categoryId: sourceId },
        data: { categoryId: targetId },
      });

      // 4. Mapping rules — la contrainte @@unique([userId, matchType, pattern])
      // peut faire échouer un simple update si la cible a déjà une règle avec
      // la même clé. On liste, puis on décide au cas par cas.
      const sourceRules = await client.csvMappingRule.findMany({
        where: { userId, categoryId: sourceId },
        select: { id: true, matchType: true, pattern: true },
      });
      let rulesMerged = 0;
      let rulesDropped = 0;
      for (const rule of sourceRules) {
        const existing = await client.csvMappingRule.findFirst({
          where: {
            userId,
            matchType: rule.matchType,
            pattern: rule.pattern,
            NOT: { id: rule.id },
          },
          select: { id: true },
        });
        if (existing) {
          // Une règle avec la même clé existe déjà — on drop celle de la source
          // pour éviter la violation d'unicité. La règle cible reste.
          await client.csvMappingRule.delete({ where: { id: rule.id } });
          rulesDropped++;
        } else {
          await client.csvMappingRule.update({
            where: { id: rule.id },
            data: { categoryId: targetId },
          });
          rulesMerged++;
        }
      }

      // 5. Delete source category. À ce point plus rien ne pointe vers elle.
      await client.category.delete({ where: { id: sourceId } });

      return {
        deleted: sourceId,
        target: { id: target.id, name: target.name },
        counts: {
          transactions: txUpdated.count,
          splits: splitsUpdated.count,
          budgetItems: budgetUpdated.count,
          rulesMerged,
          rulesDropped,
        },
      };
    });
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
