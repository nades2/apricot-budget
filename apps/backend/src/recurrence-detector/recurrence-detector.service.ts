import { BadRequestException, Injectable } from '@nestjs/common';
import { BudgetItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DetectedRecurrence, buildCandidates, TxInput } from './detection';

/**
 * Charge les transactions récentes d'un utilisateur, applique le pipeline de
 * détection pur (`detection.ts`), et retourne les candidats classés par
 * confiance décroissante. Filtre les libellés déjà couverts par un
 * `BudgetItem` actif — inutile de reproposer.
 */
@Injectable()
export class RecurrenceDetectorService {
  private static readonly DEFAULT_WINDOW_DAYS = 365;

  constructor(private readonly prisma: PrismaService) {}

  async detect(
    userId: string,
    opts: { windowDays?: number; accountId?: string } = {},
  ): Promise<DetectedRecurrence[]> {
    const windowDays = opts.windowDays ?? RecurrenceDetectorService.DEFAULT_WINDOW_DAYS;
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - windowDays);

    const txs = await this.prisma.transaction.findMany({
      where: {
        userId,
        postedAt: { gte: from },
        ...(opts.accountId ? { accountId: opts.accountId } : {}),
      },
      select: {
        id: true,
        postedAt: true,
        description: true,
        amount: true,
        categoryId: true,
      },
      orderBy: { postedAt: 'asc' },
    });

    const inputs: TxInput[] = txs.map((t) => ({
      id: t.id,
      postedAt: t.postedAt,
      description: t.description,
      amount: t.amount,
      categoryId: t.categoryId,
    }));

    const candidates = buildCandidates(inputs);

    // Filtre : masquer les candidats qui matchent déjà un BudgetItem actif
    // avec le même nom (fuzzy). Évite les doublons visuels.
    const existing = await this.prisma.budgetItem.findMany({
      where: { userId, isActive: true },
      select: { name: true, direction: true },
    });
    const existingKeys = new Set(existing.map((b) => `${b.direction}|${b.name.toLowerCase().trim()}`));

    return candidates.filter((c) => !existingKeys.has(`${c.direction}|${c.suggestedName.toLowerCase().trim()}`));
  }

  /**
   * Convertit un candidat en `BudgetItem` persistant. Le frontend passe le
   * candidat brut + éventuellement des overrides (nom, catégorie, montant)
   * si l'utilisateur a modifié la proposition.
   */
  async accept(
    userId: string,
    input: {
      candidate: DetectedRecurrence;
      overrides?: {
        name?: string;
        categoryId?: string;
        accountId?: string | null;
        amount?: string;
        anchorDate?: string;
      };
    },
  ): Promise<BudgetItem> {
    const c = input.candidate;
    const ov = input.overrides ?? {};

    const categoryId = ov.categoryId ?? c.categoryId;
    if (!categoryId) {
      throw new BadRequestException(
        'Aucune catégorie détectée pour ce candidat — spécifie categoryId dans overrides.',
      );
    }

    // Vérifier que la catégorie appartient bien à l'utilisateur (ou est système).
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        OR: [{ userId }, { userId: null }],
      },
    });
    if (!category) throw new BadRequestException('Catégorie invalide');

    const amount = new Prisma.Decimal(ov.amount ?? c.avgAmount);
    const anchorDate = new Date(ov.anchorDate ?? c.nextExpected);

    return this.prisma.budgetItem.create({
      data: {
        userId,
        categoryId,
        accountId: ov.accountId ?? null,
        name: ov.name ?? c.suggestedName,
        direction: c.direction,
        amount,
        recurrence: c.recurrence,
        anchorDate,
        confidence: c.confidence,
        autoConfirm: c.confidence >= 85,   // haute confiance → réconciliation auto
        notes: `Détecté automatiquement depuis ${c.occurrences} transactions historiques.`,
      },
    });
  }
}
