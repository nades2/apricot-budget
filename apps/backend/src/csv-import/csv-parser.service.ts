import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';

/**
 * A single row parsed from a BNC (Banque Nationale du Canada) CSV export.
 *
 * BNC produit deux formats d'export :
 *   - `checking` : compte-chèques et épargne (avec colonne `Solde`)
 *   - `credit_card` : relevé Mastercard / Visa (avec `Numero de Carte`,
 *      sans colonne `Solde`)
 *
 * Le parser détecte automatiquement le format à partir de l'en-tête et
 * produit dans les deux cas une `DesjardinsRow`. En aval (mapping engine,
 * import service) tout le pipeline est identique.
 *
 * - `amount` est *signé* : négatif pour les débits, positif pour les crédits.
 *   Cette convention s'applique aux deux formats — un achat sur la carte
 *   (Debit) devient -X, un paiement reçu sur la carte (Credit) devient +X.
 *   Combiné avec un compte typé LIABILITY (dont la balance est naturellement
 *   négative), ça donne : achats font baisser la balance, paiements la
 *   font remonter vers zéro. Cohérent.
 *
 * - `informational` = les deux colonnes Debit et Credit sont à zéro (annotation
 *   bancaire, ex. "Frais mensuels fixes"). Ces lignes sont montrées à
 *   l'utilisateur mais pas proposées à l'insertion.
 *
 * - `runningBalance` est nullable : présent uniquement pour le format chèques,
 *   qui inclut la colonne `Solde`. Pour les cartes de crédit, on ne peut pas
 *   dériver un solde par transaction sans faire la comptabilité soi-même.
 */
export type DesjardinsFormat = 'checking' | 'credit_card';

export type DesjardinsRow = {
  rowIndex: number;
  postedAt: string;                     // ISO YYYY-MM-DD
  description: string;                  // raw bank libellé
  bankCategory: string;                 // colonne "Categorie" de BNC
  amount: Prisma.Decimal;               // signé
  runningBalance: Prisma.Decimal | null;// null pour le format carte
  informational: boolean;
  format: DesjardinsFormat;             // détecté à partir de l'en-tête
  parseError?: string;
};

@Injectable()
export class CsvParserService {
  private readonly logger = new Logger(CsvParserService.name);

  private static readonly HEADERS_CHECKING = [
    'Date', 'Description', 'Categorie', 'Debit', 'Credit', 'Solde',
  ] as const;

  private static readonly HEADERS_CREDIT_CARD = [
    'Date', 'Numero de Carte', 'Description', 'Categorie', 'Debit', 'Credit',
  ] as const;

  /**
   * Décode le buffer brut en UTF-8. Si un BOM UTF-8 est présent ou que les
   * octets ressemblent à de l'UTF-8 valide, on prend tel quel. Sinon on
   * suppose que le fichier vient d'Excel/Windows et on traite comme
   * Windows-1252 (Latin-1), superset couvrant la plupart des accents FR.
   */
  private decode(buffer: Buffer): string {
    // UTF-8 BOM check
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return buffer.toString('utf8');
    }
    // Heuristique rapide : essayer UTF-8, revenir à latin1 si caractère de
    // remplacement présent dans le premier kilo-octet.
    const asUtf8 = buffer.slice(0, 1024).toString('utf8');
    if (!asUtf8.includes('�')) return buffer.toString('utf8');
    return buffer.toString('latin1');
  }

  parse(buffer: Buffer): DesjardinsRow[] {
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
        relax_column_count: true,   // tolère lignes avec colonnes en trop/manquantes
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

    // Détection du format à partir de l'en-tête ---------------------------------
    const headers = Object.keys(records[0]);
    const format = this.detectFormat(headers);

    return records.map((r, i) => this.mapRow(r, i, format));
  }

  /**
   * Choisit `checking` ou `credit_card` d'après les colonnes présentes.
   *
   * Signaux distinctifs :
   *   - `Numero de Carte` → forcément un relevé carte (chèques ne l'a jamais)
   *   - `Solde`           → forcément un relevé chèques (carte ne l'a jamais)
   *
   * Si les deux signaux sont contradictoires (aucun ou les deux), on retourne
   * une erreur claire indiquant quelles colonnes on attendait pour chaque format.
   */
  private detectFormat(headers: string[]): DesjardinsFormat {
    const hasSolde = headers.includes('Solde');
    const hasCardNumber = headers.includes('Numero de Carte');

    if (hasSolde && !hasCardNumber) {
      // Vérifier que toutes les colonnes du format chèques sont présentes.
      this.assertHeaders(headers, CsvParserService.HEADERS_CHECKING, 'chèques');
      return 'checking';
    }
    if (hasCardNumber && !hasSolde) {
      this.assertHeaders(headers, CsvParserService.HEADERS_CREDIT_CARD, 'carte de crédit');
      return 'credit_card';
    }

    throw new BadRequestException(
      `Format CSV non reconnu. Colonnes reçues : [${headers.join(', ')}]. ` +
      `Attendu chèques : [${CsvParserService.HEADERS_CHECKING.join(', ')}] ` +
      `— OU carte : [${CsvParserService.HEADERS_CREDIT_CARD.join(', ')}].`,
    );
  }

  private assertHeaders(headers: string[], required: readonly string[], label: string): void {
    for (const h of required) {
      if (!headers.includes(h)) {
        throw new BadRequestException(
          `Format ${label} détecté mais colonne manquante : "${h}". Attendu : ${required.join(', ')}.`,
        );
      }
    }
  }

  private mapRow(r: Record<string, string>, i: number, format: DesjardinsFormat): DesjardinsRow {
    const errors: string[] = [];

    const postedAt = this.parseDate(r.Date, errors);
    const debit = this.parseAmount(r.Debit, errors, 'Debit');
    const credit = this.parseAmount(r.Credit, errors, 'Credit');

    // Invariant Debit XOR Credit, sinon la ligne est ambiguë.
    if (!debit.isZero() && !credit.isZero()) {
      errors.push('Débit et Crédit non nuls simultanément');
    }

    // Signed amount : debit = négatif, credit = positif.
    const amount = credit.minus(debit);
    const informational = debit.isZero() && credit.isZero();

    // Le format chèques inclut un solde courant utilisable en checksum.
    // Le format carte n'en a pas.
    const runningBalance = format === 'checking'
      ? this.parseAmount(r.Solde, errors, 'Solde')
      : null;

    return {
      rowIndex: i,
      postedAt,
      description: (r.Description ?? '').trim(),
      bankCategory: (r.Categorie ?? '').trim(),
      amount,
      runningBalance,
      informational,
      format,
      parseError: errors.length ? errors.join('; ') : undefined,
    };
  }

  /**
   * Accepte :
   *   YYYY-MM-DD  (ISO, exports BNC récents et carte de crédit)
   *   MM/DD/YYYY  (anciens exports BNC)
   *   YYYY/MM/DD  (rare, mais supporté)
   * → normalise vers YYYY-MM-DD.
   */
  private parseDate(input: string, errors: string[]): string {
    const raw = input?.trim() ?? '';

    // ISO déjà
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

    // Formes avec /
    const slash = /^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/.exec(raw);
    if (slash) {
      const a = slash[1], b = slash[2], c = slash[3];
      // YYYY/MM/DD
      if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
      // MM/DD/YYYY (US-style, ancien BNC)
      if (c.length === 4) return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
    }

    errors.push(`Date invalide "${input}"`);
    return new Date().toISOString().slice(0, 10);
  }

  /** "345.96" → Decimal(345.96). Empty → 0. Invalid → 0 + erreur. */
  private parseAmount(input: string, errors: string[], field: string): Prisma.Decimal {
    const raw = (input ?? '').trim();
    if (raw === '' || raw === '0') return new Prisma.Decimal(0);
    // Tolère la virgule comme séparateur décimal (certains exports BNC).
    const normalized = raw.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
      errors.push(`${field} invalide "${input}"`);
      return new Prisma.Decimal(0);
    }
    return new Prisma.Decimal(normalized);
  }
}
