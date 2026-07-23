import { BudgetDirection, BudgetRecurrence } from '@prisma/client';

/**
 * Bundles de taxes — un raccourci qui crée en une seule opération tous les
 * versements d'une taxe annuelle (scolaire ou municipale). L'utilisateur
 * entre le total annuel ; le service répartit également le montant sur les
 * dates fixes définies ici.
 */
export type TaxBundleKind = 'scolaire' | 'municipale';

export type TaxBundleDate = {
  /** Étiquette affichée à l'utilisateur (ex: "1er versement — 12 février"). */
  label: string;
  /** Mois 1-12. */
  month: number;
  /** Jour 1-31. */
  day: number;
};

export type TaxBundle = {
  kind: TaxBundleKind;
  /** Nom affiché dans le picker. */
  displayName: string;
  /** Slug de la catégorie système (voir prisma/seed.ts). */
  categorySlug: string;
  emoji: string;
  /** Total annuel par défaut suggéré dans le formulaire. */
  defaultAnnualAmount: number;
  /** Dates fixes des versements. La somme des amounts après répartition
   *  égalera le total annuel. */
  dates: TaxBundleDate[];
};

export const TAX_BUNDLES: TaxBundle[] = [
  {
    kind: 'scolaire',
    displayName: 'Taxe scolaire (CSSDHR)',
    categorySlug: 'taxe-scolaire',
    emoji: '🏫',
    defaultAnnualAmount: 300,
    dates: [
      { label: '1er versement — 15 août',      month: 8,  day: 15 },
      { label: '2e versement — 15 novembre',   month: 11, day: 15 },
    ],
  },
  {
    kind: 'municipale',
    displayName: 'Taxe municipale (Saint-Jean-sur-Richelieu)',
    categorySlug: 'taxe-municipale',
    emoji: '🏛️',
    defaultAnnualAmount: 3200,
    dates: [
      { label: '1er versement — 12 février',   month: 2, day: 12 },
      { label: '2e versement — 16 avril',      month: 4, day: 16 },
      { label: '3e versement — 18 juin',       month: 6, day: 18 },
      { label: '4e versement — 17 septembre',  month: 9, day: 17 },
    ],
  },
];

/**
 * "Postes types" — proposés dans le picker de création. Chaque preset porte
 * un slug de catégorie déjà seedée (voir prisma/seed.ts). L'utilisateur peut
 * ajuster le nom, le montant et l'anchorDate avant de confirmer.
 */
export type BudgetPreset = {
  key: string;
  name: string;
  categorySlug: string;
  direction: BudgetDirection;
  amount: number;
  recurrence: BudgetRecurrence;
  emoji: string;

  /**
   * RRULE (RFC 5545) optionnelle. Prend priorité sur `recurrence` quand
   * définie. Exemple pour Taxe scolaire : "FREQ=YEARLY;BYMONTH=8,11;BYMONTHDAY=15".
   */
  rrule?: string;

  /**
   * Jour d'ancrage fixe (1-12 / 1-31). Quand présents, le frontend calcule
   * anchorDate = premier occurrence future avec ce mois/jour (année en cours
   * si à venir, sinon année suivante). Utile pour les postes à dates fixes
   * comme les taxes municipales et scolaires.
   */
  anchorMonth?: number;
  anchorDay?: number;
};

export const BUDGET_PRESETS: BudgetPreset[] = [
  // --- Habitation ---
  { key: 'loyer-hypotheque', name: 'Loyer / Hypothèque',       categorySlug: 'hypotheque-loyer',      direction: 'EXPENSE', amount: 1000, recurrence: 'MONTHLY',  emoji: '🏠' },
  { key: 'hydro',            name: 'Hydro-Québec',             categorySlug: 'services-publics',      direction: 'EXPENSE', amount: 140,  recurrence: 'MONTHLY',  emoji: '💡' },
  { key: 'internet',         name: 'Internet + téléphone',     categorySlug: 'services-publics',      direction: 'EXPENSE', amount: 100,  recurrence: 'MONTHLY',  emoji: '📡' },

  // --- Auto ---
  { key: 'paiement-auto',    name: 'Paiement d\'auto',         categorySlug: 'paiement-auto',         direction: 'EXPENSE', amount: 350,  recurrence: 'MONTHLY',  emoji: '🚗' },
  { key: 'assurance-auto',   name: 'Assurance auto',           categorySlug: 'assurance',             direction: 'EXPENSE', amount: 120,  recurrence: 'MONTHLY',  emoji: '🛡️' },
  { key: 'essence',          name: 'Essence',                  categorySlug: 'essence',               direction: 'EXPENSE', amount: 60,   recurrence: 'WEEKLY',   emoji: '⛽' },

  // --- Courses / vie ---
  { key: 'epicerie',         name: 'Épicerie',                 categorySlug: 'epicerie',              direction: 'EXPENSE', amount: 150,  recurrence: 'WEEKLY',   emoji: '🛒' },
  { key: 'restaurant',       name: 'Restaurants',              categorySlug: 'restaurant',            direction: 'EXPENSE', amount: 100,  recurrence: 'MONTHLY',  emoji: '🍽️' },
  { key: 'loisirs',          name: 'Loisirs / sorties',        categorySlug: 'loisirs',               direction: 'EXPENSE', amount: 80,   recurrence: 'MONTHLY',  emoji: '🎮' },
  { key: 'vetements',        name: 'Vêtements',                categorySlug: 'vetements',             direction: 'EXPENSE', amount: 80,   recurrence: 'MONTHLY',  emoji: '👕' },

  // --- Abonnements ---
  { key: 'netflix',          name: 'Netflix',                  categorySlug: 'loisirs',               direction: 'EXPENSE', amount: 16,   recurrence: 'MONTHLY',  emoji: '📺' },
  { key: 'spotify',          name: 'Spotify',                  categorySlug: 'loisirs',               direction: 'EXPENSE', amount: 12,   recurrence: 'MONTHLY',  emoji: '🎵' },
  { key: 'gym',              name: 'Gym',                      categorySlug: 'sante',                 direction: 'EXPENSE', amount: 40,   recurrence: 'MONTHLY',  emoji: '💪' },

  // --- Cartes de crédit ---
  { key: 'paiement-mc',      name: 'Paiement Mastercard',      categorySlug: 'paiement-carte-credit', direction: 'EXPENSE', amount: 500,  recurrence: 'MONTHLY',  emoji: '💳' },

  // --- Taxes (dates fixes annuelles) ---
  // Un preset par versement — les dates restent visibles et éditables dans
  // le champ "Date d'ancrage" du modal budget.

  // Taxe scolaire — CSSDHR : 2 versements, mi-août et mi-novembre.
  {
    key: 'taxe-scolaire-v1',
    name: 'Taxe scolaire — 15 août',
    categorySlug: 'taxe-scolaire',
    direction: 'EXPENSE',
    amount: 150,
    recurrence: 'YEARLY',
    emoji: '🏫',
    anchorMonth: 8,
    anchorDay: 15,
  },
  {
    key: 'taxe-scolaire-v2',
    name: 'Taxe scolaire — 15 novembre',
    categorySlug: 'taxe-scolaire',
    direction: 'EXPENSE',
    amount: 150,
    recurrence: 'YEARLY',
    emoji: '🏫',
    anchorMonth: 11,
    anchorDay: 15,
  },

  // Taxe municipale — Saint-Jean-sur-Richelieu : 4 versements à jours
  // hétérogènes (12/16/18/17), donc un BudgetItem par versement.
  {
    key: 'taxe-municipale-v1',
    name: 'Taxe municipale — 12 février',
    categorySlug: 'taxe-municipale',
    direction: 'EXPENSE',
    amount: 800,
    recurrence: 'YEARLY',
    emoji: '🏛️',
    anchorMonth: 2,
    anchorDay: 12,
  },
  {
    key: 'taxe-municipale-v2',
    name: 'Taxe municipale — 16 avril',
    categorySlug: 'taxe-municipale',
    direction: 'EXPENSE',
    amount: 800,
    recurrence: 'YEARLY',
    emoji: '🏛️',
    anchorMonth: 4,
    anchorDay: 16,
  },
  {
    key: 'taxe-municipale-v3',
    name: 'Taxe municipale — 18 juin',
    categorySlug: 'taxe-municipale',
    direction: 'EXPENSE',
    amount: 800,
    recurrence: 'YEARLY',
    emoji: '🏛️',
    anchorMonth: 6,
    anchorDay: 18,
  },
  {
    key: 'taxe-municipale-v4',
    name: 'Taxe municipale — 17 septembre',
    categorySlug: 'taxe-municipale',
    direction: 'EXPENSE',
    amount: 800,
    recurrence: 'YEARLY',
    emoji: '🏛️',
    anchorMonth: 9,
    anchorDay: 17,
  },

  // --- Revenus ---
  { key: 'salaire-bihebdo',  name: 'Salaire',                  categorySlug: 'salaire',               direction: 'INCOME',  amount: 2000, recurrence: 'BIWEEKLY', emoji: '💰' },
  { key: 'salaire-mensuel',  name: 'Salaire mensuel',          categorySlug: 'salaire',               direction: 'INCOME',  amount: 4000, recurrence: 'MONTHLY',  emoji: '💰' },
  { key: 'retour-impot',     name: 'Retour d\'impôt',          categorySlug: 'retour-impot',          direction: 'INCOME',  amount: 1500, recurrence: 'YEARLY',   emoji: '📄' },
];
