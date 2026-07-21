import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, CurrentUser } from '../common/current-user.decorator';

/**
 * Gestion des règles de mapping CSV (CsvMappingRule).
 *
 * Les règles sont créées :
 *   1. À la confirmation d'un import CSV, quand l'user override manuellement
 *      la suggestion pour au moins une transaction dont la description est
 *      distinctive (voir CsvImportService.confirm).
 *   2. Depuis le PATCH /transactions/:id avec `learnRule=true` — opt-in
 *      utilisateur explicite lors d'une reclassification manuelle (voir
 *      TransactionsService.update).
 *
 * Ce controller expose une lecture + une suppression : l'utilisateur doit
 * pouvoir voir et retirer une règle créée par erreur (ex. avoir coché "créer
 * une règle" sur un dépôt mobile générique).
 */
@Controller('csv-mapping-rules')
export class MappingRulesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liste toutes les règles de l'utilisateur, triées par usage récent. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.csvMappingRule.findMany({
      where: { userId: user.id },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Supprime une règle. Les transactions déjà classées ne sont pas touchées. */
  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const rule = await this.prisma.csvMappingRule.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!rule) throw new NotFoundException(`Règle ${id} introuvable`);
    await this.prisma.csvMappingRule.delete({ where: { id } });
    return { id, deleted: true };
  }
}
