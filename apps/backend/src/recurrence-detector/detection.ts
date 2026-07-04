import { Prisma, BudgetDirection, BudgetRecurrence } from '@prisma/client';

/**
 * Détecteur de récurrences — fonctions pures, testables sans DB.
 *
 * Objectif : à partir d'un flux de transactions passées, identifier des
 * groupes qui reviennent régulièrement (loyer, Netflix, paie…) et proposer
 * un BudgetItem prêt à créer, avec un score de confiance.
 *
 * Le pipeline est :
 *   1) normalize()           — nettoie le libellé bancaire bruité
 *   2) cluster()             — regroupe par libellé normalisé
 *   3) detectCadence()       — analyse les intervalles entre occurrences
 *   4) scoreConfidence()     — combine régularité + stabilité du montant
 *   5) buildCandidates()     — orchestre tout et applique les seuils
 */

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type TxInput = {
  id: string;
  postedAt: Date;
  description: string;
  amount: Prisma.Decimal | string | number;   // signé, comme en DB
  categoryId: string | null;
};

export type DetectedRecurrence = {
  key: string;                     // clé stable (normalisée) — dédup côté frontend
  suggestedName: string;           // nom lisible pour la proposition
  normalizedDescription: string;   // pour info (debug/tri)
  matchingDescriptions: string[];  // libellés bruts vus, top-3 pour affichage
  direction: BudgetDirection;
  recurrence: BudgetRecurrence;    // enum choisi selon la cadence médiane
  avgAmount: string;               // montant moyen (positif, absolu)
  amountStdev: string;             // écart-type absolu
  medianIntervalDays: number;
  intervalStdevDays: number;
  occurrences: number;
  firstSeen: string;               // YYYY-MM-DD
  lastSeen: string;                // YYYY-MM-DD
  nextExpected: string;            // YYYY-MM-DD, projection = lastSeen + median
  confidence: number;              // 0-100
  categoryId: string | null;       // catégorie majoritaire des transactions du groupe
  suggestedTransactionIds: string[]; // les tx sources — utile pour "voir les preuves"
};

// ---------------------------------------------------------------------------
//  1) Normalisation des libellés bancaires
//
//  Les CSV BNC sont bruités : dates, refs de commande, villes, numéros de
//  téléphone. Objectif : "PAIEMENT PREAUTORISE HYDRO-QUEBEC 09NOV" et
//  "PAIEMENT PREAUTORISE HYDRO-QUEBEC 08DEC" doivent normaliser vers la
//  même clé.
// ---------------------------------------------------------------------------

const MONTH_CODES = /\b(JAN|FEV|FEB|MAR|AVR|APR|MAI|MAY|JUN|JUIN|JUL|JUIL|AOU|AUG|SEP|OCT|NOV|DEC)\b/g;
const CITY_CODES = /\b(MTL|QUE|TOR|MONTREAL|QUEBEC|MTL-QC|OTT|OTTAWA)\b/g;
const ANY_DIGITS = /\d+/g;                     // toutes suites de chiffres — dates, refs, jours
const PUNCT = /[*#/\\.,\-\(\)]+/g;
const MULTI_SPACE = /\s+/g;

export function normalize(desc: string): string {
  // ORDRE IMPORTANT :
  //   1) ponctuation → espace : separe "NETFLIX.COM" en tokens propres.
  //   2) nombres : "09NOV" doit devenir " NOV" pour que \b(NOV)\b matche apres.
  //   3) codes mois/villes : maintenant delimites par des espaces.
  //   4) collapse des espaces.
  return desc
    .toUpperCase()
    .replace(PUNCT, ' ')
    .replace(ANY_DIGITS, ' ')
    .replace(MONTH_CODES, ' ')
    .replace(CITY_CODES, ' ')
    .replace(MULTI_SPACE, ' ')
    .trim()
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
//  2) Cadence : mappe l'intervalle médian sur un enum BudgetRecurrence
// ---------------------------------------------------------------------------

const CADENCE_BANDS: Array<{ min: number; max: number; recurrence: BudgetRecurrence }> = [
  { min: 5,   max: 9,   recurrence: 'WEEKLY' },
  { min: 12,  max: 16,  recurrence: 'BIWEEKLY' },
  { min: 27,  max: 33,  recurrence: 'MONTHLY' },
  { min: 350, max: 380, recurrence: 'YEARLY' },
];

export function detectCadence(medianInterval: number): BudgetRecurrence | null {
  for (const band of CADENCE_BANDS) {
    if (medianInterval >= band.min && medianInterval <= band.max) return band.recurrence;
  }
  return null;
}

// ---------------------------------------------------------------------------
//  3) Score de confiance 0-100
//
//  40 base (≥ 3 occurrences requis)
//  + jusqu'à +30 pour le nombre d'occurrences (10 par occ au-dessus de 3)
//  + jusqu'à +20 pour la stabilité de l'intervalle (stdev < 3j = +20)
//  + jusqu'à +10 pour la stabilité du montant (CoV < 5% = +10)
// ---------------------------------------------------------------------------

export function scoreConfidence(
  occurrences: number,
  intervalStdev: number,
  amountCov: number,
): number {
  let score = 40;
  score += Math.min(30, (occurrences - 3) * 10);
  if (intervalStdev < 1)  score += 20;
  else if (intervalStdev < 2) score += 15;
  else if (intervalStdev < 3) score += 10;
  else if (intervalStdev < 5) score += 5;
  if (amountCov < 0.02) score += 10;
  else if (amountCov < 0.05) score += 7;
  else if (amountCov < 0.10) score += 4;
  return Math.min(100, Math.max(0, score));
}

// ---------------------------------------------------------------------------
//  4) Helpers statistiques
// ---------------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
//  5) Pipeline complet
// ---------------------------------------------------------------------------

export type BuildOptions = {
  minOccurrences?: number;         // défaut 3
  minConfidence?: number;          // défaut 60
};

export function buildCandidates(
  txs: TxInput[],
  opts: BuildOptions = {},
): DetectedRecurrence[] {
  const minOcc = opts.minOccurrences ?? 3;
  const minConf = opts.minConfidence ?? 60;

  // ------------------- Cluster par (direction, normalized) ------------------
  // Séparer EXPENSE vs INCOME évite qu'un remboursement pollue une charge.
  const clusters = new Map<string, TxInput[]>();
  for (const tx of txs) {
    const amt = new Prisma.Decimal(tx.amount);
    if (amt.isZero()) continue;
    const direction: BudgetDirection = amt.isNegative() ? 'EXPENSE' : 'INCOME';
    const key = `${direction}|${normalize(tx.description)}`;
    const bucket = clusters.get(key) ?? [];
    bucket.push(tx);
    clusters.set(key, bucket);
  }

  const results: DetectedRecurrence[] = [];

  for (const [key, group] of clusters) {
    if (group.length < minOcc) continue;

    const [direction, normalizedDesc] = key.split('|') as [BudgetDirection, string];
    if (!normalizedDesc) continue;

    const sorted = [...group].sort((a, b) => a.postedAt.getTime() - b.postedAt.getTime());

    // Intervalles entre occurrences successives.
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].postedAt, sorted[i].postedAt));
    }
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const medianInterval = median(sortedIntervals);
    const intervalStdev = stdev(intervals);

    const cadence = detectCadence(medianInterval);
    if (!cadence) continue;

    // Statistiques sur le montant absolu (positif).
    const amountsAbs = sorted.map((t) => Math.abs(Number(new Prisma.Decimal(t.amount))));
    const avg = amountsAbs.reduce((s, v) => s + v, 0) / amountsAbs.length;
    const amountStdev = stdev(amountsAbs);
    const cov = avg > 0 ? amountStdev / avg : Infinity;

    const confidence = scoreConfidence(sorted.length, intervalStdev, cov);
    if (confidence < minConf) continue;

    // Catégorie majoritaire — utile pour pré-remplir le BudgetItem créé.
    const categoryId = pickMajorityCategory(sorted);

    // Nom lisible : la version normalisée en Title Case.
    const suggestedName = toTitleCase(normalizedDesc);

    // Projection de la prochaine occurrence.
    const last = sorted[sorted.length - 1].postedAt;
    const next = new Date(last.getTime());
    next.setUTCDate(next.getUTCDate() + Math.round(medianInterval));

    // Top-3 libellés bruts pour affichage ("On a détecté ceci dans : X, Y, Z").
    const matchingDescriptions = [...new Set(sorted.map((t) => t.description))].slice(0, 3);

    results.push({
      key,
      suggestedName,
      normalizedDescription: normalizedDesc,
      matchingDescriptions,
      direction,
      recurrence: cadence,
      avgAmount: avg.toFixed(2),
      amountStdev: amountStdev.toFixed(2),
      medianIntervalDays: Math.round(medianInterval),
      intervalStdevDays: Number(intervalStdev.toFixed(2)),
      occurrences: sorted.length,
      firstSeen: toISODate(sorted[0].postedAt),
      lastSeen: toISODate(last),
      nextExpected: toISODate(next),
      confidence,
      categoryId,
      suggestedTransactionIds: sorted.slice(0, 10).map((t) => t.id),
    });
  }

  // Tri : confiance décroissante, puis nombre d'occurrences.
  results.sort((a, b) => (b.confidence - a.confidence) || (b.occurrences - a.occurrences));
  return results;
}

// ---------------------------------------------------------------------------
//  Helpers privés
// ---------------------------------------------------------------------------

function pickMajorityCategory(txs: TxInput[]): string | null {
  const counts = new Map<string, number>();
  for (const t of txs) {
    if (!t.categoryId) continue;
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
}
