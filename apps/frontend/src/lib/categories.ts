/**
 * Slugs de catégories "techniques" que l'utilisateur ne doit PAS pouvoir
 * choisir manuellement dans un dropdown de reclassification :
 *
 *   - `non-categorise`      → doublon avec l'option "-- Non catégorisée --"
 *                             (categoryId = null) déjà présente en tête.
 *   - `transfert`           → utilisée par la mécanique de liaison
 *                             (linkTransactionId), pas par assignment direct.
 *   - `paiement-carte-credit` → auto-détectée à l'import ; l'utilisateur ne
 *                             devrait pas l'appliquer à autre chose qu'un
 *                             vrai paiement CC.
 *   - `remboursement`       → catégorie "staging" fourre-tout du BNC. Le
 *                             modèle veut que l'user reclasse soit vers la
 *                             catégorie DÉPENSE originale (remboursement
 *                             marchand : Santé, Épicerie, …) soit vers un
 *                             REVENU (Remboursements gouv., etc.).
 *
 * Doit rester synchronisée avec `TECHNICAL_CATEGORY_SLUGS` côté backend
 * (`apps/backend/src/budget/budget.service.ts`).
 */
export const TECHNICAL_CATEGORY_SLUGS = new Set<string>([
  'non-categorise',
  'transfert',
  'paiement-carte-credit',
  'remboursement',
]);

/** True si la catégorie peut être choisie dans un dropdown de reclassification. */
export function isSelectableCategory(slug: string): boolean {
  return !TECHNICAL_CATEGORY_SLUGS.has(slug.toLowerCase());
}
