import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ImportStatus, MappingMatchType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CsvParserService, DesjardinsRow } from './csv-parser.service';
import { MappingEngineService, MappingSuggestion } from './mapping-engine.service';
import { ConfirmImportDto } from './dto/confirm-import.dto';

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: CsvParserService,
    private readonly engine: MappingEngineService,
  ) {}

  /**
   * Step 1 — Upload.
   * Parse the CSV, compute suggestions, persist as a MAPPING import.
   */
  async upload(userId: string, accountId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fichier CSV manquant');

    // Make sure the account belongs to this user (guards cross-tenant abuse).
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException(`Compte ${accountId} introuvable`);

    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    // Reject re-imports of the exact same file.
    const existing = await this.prisma.csvImport.findFirst({
      where: { userId, fileHash },
    });
    if (existing) {
      throw new ConflictException(
        `Ce fichier a déjà été importé (import ${existing.id}, statut ${existing.status})`,
      );
    }

    const rows = this.parser.parse(file.buffer);
    const suggestions = await this.engine.computeSuggestions(userId, rows);

    // Serialize both rows and suggestions into raw_payload (jsonb).
    // Decimals are stringified to preserve precision through JSON.
    const rawPayload = rows.map((r, i) => ({
      ...r,
      amount: r.amount.toString(),
      runningBalance: r.runningBalance.toString(),
      suggestion: suggestions[i],
    }));

    const mappedCount = suggestions.filter((s) => s.suggestedCategoryId !== null).length;

    return this.prisma.csvImport.create({
      data: {
        userId,
        accountId,
        filename: file.originalname,
        fileHash,
        rowCount: rows.length,
        mappedCount,
        status: ImportStatus.MAPPING,
        rawPayload: rawPayload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Step 2 — Preview.
   * Returns the parsed rows with their suggested category and confidence,
   * for the wizard's "review mappings" step.
   */
  async preview(userId: string, importId: string) {
    const imp = await this.prisma.csvImport.findFirst({
      where: { id: importId, userId },
    });
    if (!imp) throw new NotFoundException(`Import ${importId} introuvable`);
    return imp;
  }

  /**
   * Step 3 — Confirm.
   * Persists the transactions and learns any new mapping rules the user asked
   * us to remember. Everything happens in a single Prisma $transaction so a
   * failure mid-way leaves the DB untouched.
   */
  async confirm(userId: string, importId: string, dto: ConfirmImportDto) {
    const imp = await this.prisma.csvImport.findFirst({
      where: { id: importId, userId },
      include: { account: { select: { id: true } } },
    });
    if (!imp) throw new NotFoundException(`Import ${importId} introuvable`);
    if (imp.status !== ImportStatus.MAPPING) {
      throw new BadRequestException(`Import déjà en statut ${imp.status}`);
    }

    // Reconstitute rows + suggestions from raw_payload.
    type StoredRow = DesjardinsRow & {
      amount: string;
      runningBalance: string;
      suggestion: MappingSuggestion;
    };
    const stored = (imp.rawPayload as unknown as StoredRow[]) ?? [];
    const byRow = new Map(dto.mappings.map((m) => [m.rowIndex, m]));

    // Build the batch of transactions to insert, and the list of rules to learn.
    const txData: Prisma.TransactionCreateManyInput[] = [];
    const rulesToLearn: { pattern: string; categoryId: string }[] = [];
    for (const row of stored) {
      if (row.informational || row.parseError) continue;
      const override = byRow.get(row.rowIndex);
      const categoryId = override?.categoryId ?? row.suggestion?.suggestedCategoryId ?? null;
      txData.push({
        userId,
        accountId: imp.accountId,
        categoryId,
        postedAt: new Date(row.postedAt),
        description: row.description,
        amount: new Prisma.Decimal(row.amount),
        importedBalance: new Prisma.Decimal(row.runningBalance),
        csvImportId: imp.id,
      });
      if (override?.saveAsRule && categoryId) {
        rulesToLearn.push({ pattern: row.description, categoryId });
      }
    }

    // Bumped timeout — 216 rows on a NAS can take longer than the 5s default.
    return this.prisma.$transaction(
      async (tx) => {
        // One SQL statement instead of 216 round-trips.
        const { count: insertedCount } = await tx.transaction.createMany({
          data: txData,
          skipDuplicates: true, // gracefully handle re-runs against unique (account_id, posted_at, amount, external_id)
        });

        // Rules are usually a small subset — a handful at most — so individual upserts are fine.
        for (const r of rulesToLearn) {
          await tx.csvMappingRule.upsert({
            where: {
              uq_rule_user_pattern: {
                userId,
                matchType: MappingMatchType.EXACT,
                pattern: r.pattern,
              },
            },
            update: {
              categoryId: r.categoryId,
              timesUsed: { increment: 1 },
              lastUsedAt: new Date(),
            },
            create: {
              userId,
              categoryId: r.categoryId,
              matchType: MappingMatchType.EXACT,
              pattern: r.pattern,
              autoCreated: true,
              timesUsed: 1,
              lastUsedAt: new Date(),
              priority: 200,
            },
          });
        }

        return tx.csvImport.update({
          where: { id: imp.id },
          data: {
            status: ImportStatus.CONFIRMED,
            confirmedAt: new Date(),
            mappedCount: insertedCount,
            rawPayload: Prisma.JsonNull,
          },
        });
      },
      { timeout: 30_000, maxWait: 5_000 },
    );
  }

  /**
   * Rollback — deletes all transactions linked to this import and the import
   * itself. Because of ON DELETE SET NULL on the FK, we do it manually here.
   */
  async rollback(userId: string, importId: string) {
    const imp = await this.prisma.csvImport.findFirst({
      where: { id: importId, userId },
    });
    if (!imp) throw new NotFoundException(`Import ${importId} introuvable`);

    return this.prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({
        where: { userId, csvImportId: imp.id },
      });
      return tx.csvImport.delete({ where: { id: imp.id } });
    });
  }

  list(userId: string) {
    return this.prisma.csvImport.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
      include: { account: { select: { id: true, name: true } } },
    });
  }
}
