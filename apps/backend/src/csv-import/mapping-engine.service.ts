import { Injectable, Logger } from '@nestjs/common';
import { CsvMappingRule, MappingMatchType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DesjardinsRow } from './csv-parser.service';

/**
 * Where a suggested category came from — kept in the preview so the UI
 * can render confidence badges and let the user override with context.
 */
export type MappingSource = 'user_rule' | 'bank_category' | 'similar_history' | 'none';

export type MappingSuggestion = {
  rowIndex: number;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  confidence: number;         // 0..1
  source: MappingSource;
  matchedRuleId?: string;
  matchedPattern?: string;
};

/**
 * Three-pass correlation:
 *
 *   Pass 1  user-defined rules (csv_mapping_rules), highest priority first.
 *           EXACT > PREFIX > CONTAINS > REGEX matches.
 *
 *   Pass 2  the CSV's own "Categorie" column (BNC already tries to
 *           classify). Slug-normalize it and look for an existing category
 *           with that slug or name.
 *
 *   Pass 3  pg_trgm similarity against historical transactions the user has
 *           already categorized. Highest-similarity category wins if the
 *           similarity crosses a threshold.
 */
@Injectable()
export class MappingEngineService {
  private readonly logger = new Logger(MappingEngineService.name);
  private static readonly TRGM_THRESHOLD = 0.4; // pg_trgm default is 0.3

  constructor(private readonly prisma: PrismaService) {}

  async computeSuggestions(userId: string, rows: DesjardinsRow[]): Promise<MappingSuggestion[]> {
    // Preload everything we need once, then match in-memory / with cheap SQL.
    const rules = await this.prisma.csvMappingRule.findMany({
      where: { userId },
      orderBy: [{ priority: 'desc' }, { timesUsed: 'desc' }],
    });
    const categories = await this.prisma.category.findMany({
      where: { OR: [{ userId }, { userId: null }] },
    });
    const bySlug = new Map(categories.map((c) => [this.slugify(c.name), c]));
    for (const c of categories) bySlug.set(c.slug.toLowerCase(), c);

    const suggestions: MappingSuggestion[] = [];
    for (const row of rows) {
      if (row.informational || row.parseError) {
        suggestions.push({
          rowIndex: row.rowIndex,
          suggestedCategoryId: null,
          suggestedCategoryName: null,
          confidence: 0,
          source: 'none',
        });
        continue;
      }

      const s =
        this.matchUserRules(row, rules, categories) ??
        this.matchBankCategory(row, bySlug) ??
        (await this.matchSimilarHistory(userId, row, categories));

      suggestions.push(s ?? {
        rowIndex: row.rowIndex,
        suggestedCategoryId: null,
        suggestedCategoryName: null,
        confidence: 0,
        source: 'none',
      });
    }
    return suggestions;
  }

  // ---- Pass 1 -------------------------------------------------------------
  private matchUserRules(
    row: DesjardinsRow,
    rules: CsvMappingRule[],
    categories: { id: string; name: string }[],
  ): MappingSuggestion | null {
    const desc = row.description.toLowerCase();
    for (const rule of rules) {
      const p = rule.pattern.toLowerCase();
      let hit = false;
      switch (rule.matchType) {
        case MappingMatchType.EXACT:    hit = desc === p; break;
        case MappingMatchType.PREFIX:   hit = desc.startsWith(p); break;
        case MappingMatchType.CONTAINS: hit = desc.includes(p); break;
        case MappingMatchType.REGEX:
          try { hit = new RegExp(rule.pattern, 'i').test(row.description); } catch { hit = false; }
          break;
      }
      if (hit) {
        const cat = categories.find((c) => c.id === rule.categoryId);
        return {
          rowIndex: row.rowIndex,
          suggestedCategoryId: rule.categoryId,
          suggestedCategoryName: cat?.name ?? null,
          confidence: rule.matchType === MappingMatchType.EXACT ? 1.0 : 0.9,
          source: 'user_rule',
          matchedRuleId: rule.id,
          matchedPattern: rule.pattern,
        };
      }
    }
    return null;
  }

  // ---- Pass 2 -------------------------------------------------------------
  private matchBankCategory(
    row: DesjardinsRow,
    bySlug: Map<string, { id: string; name: string }>,
  ): MappingSuggestion | null {
    if (!row.bankCategory || row.bankCategory.toLowerCase() === 'non categorise') return null;
    const slug = this.slugify(row.bankCategory);
    const hit = bySlug.get(slug);
    if (!hit) return null;
    return {
      rowIndex: row.rowIndex,
      suggestedCategoryId: hit.id,
      suggestedCategoryName: hit.name,
      confidence: 0.8,
      source: 'bank_category',
      matchedPattern: row.bankCategory,
    };
  }

  // ---- Pass 3 -------------------------------------------------------------
  private async matchSimilarHistory(
    userId: string,
    row: DesjardinsRow,
    categories: { id: string; name: string }[],
  ): Promise<MappingSuggestion | null> {
    // Find the historical transaction with the highest trigram similarity
    // to this description, provided it exceeds our threshold.
    const results = await this.prisma.$queryRaw<
      Array<{ category_id: string; sim: number }>
    >`
      SELECT t.category_id, similarity(t.description, ${row.description}::citext) AS sim
      FROM transactions t
      WHERE t.user_id = ${userId}::uuid
        AND t.category_id IS NOT NULL
        AND t.description % ${row.description}::citext
      ORDER BY sim DESC
      LIMIT 1
    `;
    const top = results[0];
    if (!top || top.sim < MappingEngineService.TRGM_THRESHOLD) return null;

    const cat = categories.find((c) => c.id === top.category_id);
    return {
      rowIndex: row.rowIndex,
      suggestedCategoryId: top.category_id,
      suggestedCategoryName: cat?.name ?? null,
      confidence: Math.min(0.75, top.sim),
      source: 'similar_history',
      matchedPattern: `similarity=${top.sim.toFixed(2)}`,
    };
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
