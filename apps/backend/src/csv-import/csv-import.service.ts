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
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: CsvParserService,
    private readonly engine: MappingEngineService,
    private readonly reconciliation: ReconciliationService,
    private readonly transactions: TransactionsService,
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
    // Decimals are stringified to preserve precision through JSON. Le solde
    // est nullable — c'est le cas pour le format carte de crédit.
    const rawPayload = rows.map((r, i) => ({
      ...r,
      amount: r.amount.toString(),
      runningBalance: r.runningBalance ? r.runningBalance.toString() : null,
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
    // `runningBalance` est sérialisé nullable (le format carte n'en a pas).
    type StoredRow = Omit<DesjardinsRow, 'amount' | 'runningBalance'> & {
      amount: string;
      runningBalance: string | null;
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
        importedBalance: row.runningBalance !== null ? new Prisma.Decimal(row.runningBalance) : null,
        csvImportId: imp.id,
      });
      if (override?.saveAsRule && categoryId) {
        rulesToLearn.push({ pattern: row.description, categoryId });
      }
    }

    // Bumped timeout — 216 rows on a NAS can take longer than the 5s default.
    const confirmed = await this.prisma.$transaction(
      async (tx) => {
        // One SQL statement instead of 216 round-trips.
        const { count: insertedCount } = await tx.transaction.createMany({
          data: txData,
          skipDuplicates: true, // gracefully handle re-runs against unique (account_id, posted_at, amount, external_id)
        });

        // Phase 1 — Splits miroirs.
        // createMany n'accepte pas les nested writes; on insère les splits en
        // une seule requête depuis la table transactions elle-même, en se
        // limitant aux rows tout juste rattachées à cet import et qui n'ont
        // pas déjà un split (ré-import idempotent). Une ligne split par
        // transaction, sortOrder=0, amount et categoryId recopiés verbatim.
        await tx.$executeRaw`
          INSERT INTO "transaction_splits" ("transaction_id", "category_id", "amount", "sort_order")
          SELECT t."id", t."category_id", t."amount", 0
          FROM "transactions" t
          WHERE t."csv_import_id" = ${imp.id}::uuid
            AND NOT EXISTS (
              SELECT 1 FROM "transaction_splits" s WHERE s."transaction_id" = t."id"
            )
        `;

        // Reconciliation - dans la meme transaction Prisma pour rester atomique.
        // Fenetre = min/max des dates postees dans le lot.
        if (txData.length > 0) {
          const dates = txData.map((t) => t.postedAt as Date);
          const from = new Date(Math.min(...dates.map((d) => d.getTime())));
          const to = new Date(Math.max(...dates.map((d) => d.getTime())));
          await this.reconciliation.reconcile(userId, {
            accountId: imp.accountId,
            from,
            to,
            client: tx,
          });
        }

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

    // Détection auto de transferts APRÈS commit — on ne veut pas relier des
    // rows encore en cours d'insertion. Le scope `since` est un peu plus
    // permissif que la fenêtre exacte du batch : on prend 10 jours avant la
    // plus vieille date importée pour attraper la contrepartie potentielle
    // sur un autre compte déjà importé plus tôt.
    if (txData.length > 0) {
      const oldestDate = new Date(Math.min(...txData.map((t) => (t.postedAt as Date).getTime())));
      const sinceDate = new Date(oldestDate);
      sinceDate.setUTCDate(sinceDate.getUTCDate() - 10);
      try {
        const result = await this.transactions.detectAndLinkTransfers(userId, {
          mode: 'since',
          sinceDate,
        });
        if (result.linked.length > 0) {
          this.logger.log(
            `Auto-linked ${result.linked.length} transfer pair(s) after import ${imp.id}`,
          );
        }
        if (result.ambiguous.length > 0) {
          this.logger.warn(
            `${result.ambiguous.length} ambiguous CC-payment tx(s) after import ${imp.id} — user must arbitrate manually`,
          );
        }
      } catch (e) {
        // La détection n'est pas critique pour l'import — on log et on continue.
        this.logger.error(`Detect transfers failed for import ${imp.id}: ${(e as Error).message}`);
      }
    }

    return confirmed;
  }

  /**
   * Rollback — deletes all transactions linked to this import and the import
   * itself. Because of ON DELETE SET NULL on the FK, we do it manually here.
   *
   * Étapes (dans une seule Prisma $transaction) :
   *   1. Trouver les IDs de transactions liées à cet import.
   *   2. Réinitialiser les ScheduledInstance qui y étaient matchées (REALIZED
   *      → PROJECTED, matched_transaction_id → NULL). Sans ça, le ON DELETE
   *      SET NULL sur `matched_transaction_id` viole la CHECK
   *      `chk_instance_realized_has_match` (REALIZED exige un match non-null).
   *   3. Casser les liens de transfert vers d'autres transactions (Phase 5).
   *      Le ON DELETE SET NULL fait déjà ça côté DB pour l'autre côté, mais
   *      on nettoie aussi les splits/refs pendantes pour rester propre.
   *   4. Supprimer les transactions (les splits cascadent, matched_scheduled
   *      et linked_transaction_id sont set-null côté DB).
   *   5. Supprimer l'import.
   */
  async rollback(userId: string, importId: string) {
    const imp = await this.prisma.csvImport.findFirst({
      where: { id: importId, userId },
    });
    if (!imp) throw new NotFoundException(`Import ${importId} introuvable`);

    return this.prisma.$transaction(async (tx) => {
      const txsToDelete = await tx.transaction.findMany({
        where: { userId, csvImportId: imp.id },
        select: { id: true },
      });
      const ids = txsToDelete.map((t) => t.id);

      if (ids.length > 0) {
        // 2. Reset les ScheduledInstance qui référencent ces transactions.
        //    On DOIT le faire avant le delete pour éviter la violation du
        //    CHECK constraint `chk_instance_realized_has_match`.
        await tx.scheduledInstance.updateMany({
          where: { matchedTransactionId: { in: ids } },
          data: {
            status: 'PROJECTED',
            matchedTransactionId: null,
          },
        });

        // 3. Casser les liens de transfert entrants (par précaution — le
        //    ON DELETE SET NULL fait le job côté DB, mais Prisma cache
        //    parfois des données stales dans les includes).
        await tx.transaction.updateMany({
          where: { linkedTransactionId: { in: ids } },
          data: { linkedTransactionId: null },
        });

        // 4. Supprime les transactions elles-mêmes.
        await tx.transaction.deleteMany({
          where: { id: { in: ids } },
        });
      }

      // 5. Supprime l'import.
      return tx.csvImport.delete({ where: { id: imp.id } });
    });
  }

  /**
   * Liste tous les imports de l'utilisateur, décorés avec :
   *   - `account: { id, name }`   → nom du compte cible
   *   - `txCount`                 → nombre de transactions encore rattachées
   *   - `minPostedAt` / `maxPostedAt` → fenêtre couverte par les transactions
   *
   * Pour un import CONFIRMED sans transactions restantes (déjà rollback partiel
   * ou dédup total), txCount peut valoir 0 — l'UI affiche alors une période vide.
   */
  async list(userId: string) {
    const imports = await this.prisma.csvImport.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
      include: { account: { select: { id: true, name: true } } },
    });

    if (imports.length === 0) return [];

    // Une seule requête d'agrégat pour tous les imports du user.
    const aggregates = await this.prisma.transaction.groupBy({
      by: ['csvImportId'],
      where: {
        userId,
        csvImportId: { in: imports.map((i) => i.id) },
      },
      _count: { _all: true },
      _min: { postedAt: true },
      _max: { postedAt: true },
    });
    const byImportId = new Map(
      aggregates.map((a) => [
        a.csvImportId as string,
        {
          txCount: a._count._all,
          minPostedAt: a._min.postedAt,
          maxPostedAt: a._max.postedAt,
        },
      ]),
    );

    return imports.map((imp) => {
      const agg = byImportId.get(imp.id);
      return {
        ...imp,
        txCount: agg?.txCount ?? 0,
        minPostedAt: agg?.minPostedAt?.toISOString().slice(0, 10) ?? null,
        maxPostedAt: agg?.maxPostedAt?.toISOString().slice(0, 10) ?? null,
      };
    });
  }
}
