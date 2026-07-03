import { BudgetDirection, BudgetRecurrence } from '@prisma/client';

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

  // --- Revenus ---
  { key: 'salaire-bihebdo',  name: 'Salaire',                  categorySlug: 'salaire',               direction: 'INCOME',  amount: 2000, recurrence: 'BIWEEKLY', emoji: '💰' },
  { key: 'salaire-mensuel',  name: 'Salaire mensuel',          categorySlug: 'salaire',               direction: 'INCOME',  amount: 4000, recurrence: 'MONTHLY',  emoji: '💰' },
  { key: 'retour-impot',     name: 'Retour d\'impôt',          categorySlug: 'retour-impot',          direction: 'INCOME',  amount: 1500, recurrence: 'YEARLY',   emoji: '📄' },
];
