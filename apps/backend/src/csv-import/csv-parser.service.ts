import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';

/**
 * A single row parsed from a BNC (Banque Nationale du Canada) CSV export.
 * - `amount` is *signed*: negative for debits, positive for credits.
 * - `informational` = both Debit and Credit were 0 (bank annotation, e.g. "Frais mensuels fixes")
 *   → these rows are surfaced to the user but not proposed for insertion.
 */
export type DesjardinsRow = {
  rowIndex: number;
  postedAt: string;         // ISO YYYY-MM-DD
  description: string;      // raw bank libellé
  bankCategory: string;     // Desjardins "Categorie" column
  amount: Prisma.Decimal;   // signed
  runningBalance: Prisma.Decimal;
  informational: boolean;
  parseError?: string;
};

@Injectable()
export class CsvParserService {
  private readonly logger = new Logger(CsvParserService.name);

  private static readonly EXPECTED_HEADERS = [
    'Date', 'Description', 'Categorie', 'Debit', 'Credit', 'Solde',
  ] as const;

  /**
   * Decode the raw buffer to a UTF-8 string. If a UTF-8 BOM is present or the
   * bytes look like valid UTF-8, we take it as-is. Otherwise assume the file
   * comes from Excel/Windows and treat it as Windows-1252 (Latin-1) which is
   * a superset covering most French accents.
   */
  private decode(buffer: Buffer): string {
    // UTF-8 BOM check
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return buffer.toString('utf8');
    }
    // Quick heuristic: try UTF-8 and see if it round-trips without replacement chars
    // for the first kilobyte.
    const asUtf8 = buffer.slice(0, 1024).toString('utf8');
    if (!asUtf8.includes('�')) return buffer.toString('utf8');
    return buffer.toString('latin1');
  }

  parse(buffer: Buffer): DesjardinsRow[] {
    // Auto-detect the separator by looking at the first non-empty line.
    // BNC exports in fr-CA sometimes use ';' as delimiter and use ',' as decimal separator.
    const text = this.decode(buffer);
    const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
    const semis = (firstLine.match(/;/g) ?? []).length;
    const commas = (firstLine.match(/,/g) ?? []).length;
    const delimiter = semis > commas ? ';' : ',';

    let records: Record<string, string>[];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_quotes: true,
        relax_column_count: true,   // tolerate rows with extra/missing columns
        delimiter,
        record_delimiter: ['\r\n', '\n', '\r'],
      }) as Record<string, string>[];
    } catch (e) {
      const msg = (e as Error).message;
      throw new BadRequestException(
        `Échec du parsing CSV (séparateur détecté: "${delimiter}") — ${msg}. ` +
        `Vérifie que le fichier est bien un export BNC standard, encodé en UTF-8.`,
      );
    }

    if (records.length === 0) throw new BadRequestException('CSV vide');

    // Header check — protects against non-BNC CSVs being uploaded.
    const headers = Object.keys(records[0]);
    for (const h of CsvParserService.EXPECTED_HEADERS) {
      if (!headers.includes(h)) {
        throw new BadRequestException(
          `Colonne manquante "${h}". Attendu: ${CsvParserService.EXPECTED_HEADERS.join(', ')}`,
        );
      }
    }

    return records.map((r, i) => this.mapRow(r, i));
  }

  private mapRow(r: Record<string, string>, i: number): DesjardinsRow {
    const errors: string[] = [];

    const postedAt = this.parseDate(r.Date, errors);
    const debit = this.parseAmount(r.Debit, errors, 'Debit');
    const credit = this.parseAmount(r.Credit, errors, 'Credit');
    const runningBalance = this.parseAmount(r.Solde, errors, 'Solde');

    // Debit XOR Credit invariant, otherwise the row is ambiguous.
    if (!debit.isZero() && !credit.isZero()) {
      errors.push('Débit et Crédit non nuls simultanément');
    }

    // Signed amount: debit = negative, credit = positive.
    const amount = credit.minus(debit);
    const informational = debit.isZero() && credit.isZero();

    return {
      rowIndex: i,
      postedAt,
      description: (r.Description ?? '').trim(),
      bankCategory: (r.Categorie ?? '').trim(),
      amount,
      runningBalance,
      informational,
      parseError: errors.length ? errors.join('; ') : undefined,
    };
  }

  /**
   * Accepts:
   *   YYYY-MM-DD  (ISO, some BNC exports)
   *   MM/DD/YYYY  (older BNC exports)
   *   YYYY/MM/DD  (rare, but supported)
   * → normalizes to YYYY-MM-DD.
   */
  private parseDate(input: string, errors: string[]): string {
    const raw = input?.trim() ?? '';

    // ISO already
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

    // Slash forms — decide which side is the year.
    const slash = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/.exec(raw);
    if (slash) {
      const a = slash[1], b = slash[2], c = slash[3];
      // YYYY/MM/DD
      if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
      // MM/DD/YYYY (US-style, older BNC)
      if (c.length === 4) return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
    }

    errors.push(`Date invalide "${input}"`);
    return new Date().toISOString().slice(0, 10);
  }

  /** "345.96" → Decimal(345.96). Empty → 0. Invalid → 0 + error. */
  private parseAmount(input: string, errors: string[], field: string): Prisma.Decimal {
    const raw = (input ?? '').trim();
    if (raw === '' || raw === '0') return new Prisma.Decimal(0);
    // Tolerate a comma as decimal separator (some BNC exports use it).
    const normalized = raw.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
      errors.push(`${field} invalide "${input}"`);
      return new Prisma.Decimal(0);
    }
    return new Prisma.Decimal(normalized);
  }
}
