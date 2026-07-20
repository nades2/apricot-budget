-- ============================================================================
--  Phase 1 — Vérifications post-migration
--
--  À rouler après `prisma migrate deploy` (ou l'équivalent sur le NAS).
--  Toutes les requêtes ci-dessous doivent retourner 0 ligne (ou compte 0),
--  sauf indication contraire. Un résultat non vide indique une incohérence
--  à corriger avant de passer à la Phase 2.
--
--  Usage :
--    psql "$DATABASE_URL" -f prisma/verify/phase1_splits_and_transfers.sql
-- ============================================================================

\echo '======================================================================'
\echo 'Check 1 — Chaque transaction a au moins 1 split'
\echo '   Attendu : 0 ligne'
\echo '----------------------------------------------------------------------'
SELECT t.id, t.description, t.amount
FROM transactions t
WHERE NOT EXISTS (
  SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.id
);

\echo ''
\echo '======================================================================'
\echo 'Check 2 — La somme des splits égale le montant de la transaction'
\echo '   Attendu : 0 ligne'
\echo '----------------------------------------------------------------------'
SELECT
  t.id,
  t.description,
  t.amount           AS parent_amount,
  SUM(s.amount)      AS splits_sum,
  t.amount - SUM(s.amount) AS diff
FROM transactions t
JOIN transaction_splits s ON s.transaction_id = t.id
GROUP BY t.id, t.description, t.amount
HAVING t.amount <> SUM(s.amount);

\echo ''
\echo '======================================================================'
\echo 'Check 3 — En Phase 1, chaque transaction a exactement 1 split'
\echo '   (Devient >1 après la Phase 2. Ici on veut = 1 pour valider le backfill.)'
\echo '   Attendu : 0 ligne'
\echo '----------------------------------------------------------------------'
SELECT
  t.id,
  t.description,
  COUNT(s.id) AS split_count
FROM transactions t
LEFT JOIN transaction_splits s ON s.transaction_id = t.id
GROUP BY t.id, t.description
HAVING COUNT(s.id) <> 1;

\echo ''
\echo '======================================================================'
\echo 'Check 4 — Cohérence category_id : le split miroir doit avoir la même'
\echo '           catégorie que la transaction parente.'
\echo '   Attendu : 0 ligne'
\echo '----------------------------------------------------------------------'
SELECT
  t.id,
  t.description,
  t.category_id AS tx_category_id,
  s.category_id AS split_category_id
FROM transactions t
JOIN transaction_splits s ON s.transaction_id = t.id
WHERE t.category_id IS DISTINCT FROM s.category_id;

\echo ''
\echo '======================================================================'
\echo 'Check 5 — linked_transaction_id : uniqueness partielle et symétrie.'
\echo '   Sous-check 5a : aucune transaction pointée par 2+ transactions.'
\echo '   Attendu : 0 ligne'
\echo '----------------------------------------------------------------------'
SELECT linked_transaction_id, COUNT(*) AS pointing_count
FROM transactions
WHERE linked_transaction_id IS NOT NULL
GROUP BY linked_transaction_id
HAVING COUNT(*) > 1;

\echo ''
\echo '   Sous-check 5b : symétrie du lien (A→B implique B→A).'
\echo '   Attendu : 0 ligne'
\echo '----------------------------------------------------------------------'
SELECT
  a.id            AS a_id,
  a.linked_transaction_id AS a_points_to,
  b.linked_transaction_id AS b_points_to
FROM transactions a
JOIN transactions b ON b.id = a.linked_transaction_id
WHERE b.linked_transaction_id IS DISTINCT FROM a.id;

\echo ''
\echo '======================================================================'
\echo 'Check 6 — Stats globales (informationnel, aucune assertion)'
\echo '----------------------------------------------------------------------'
SELECT
  (SELECT COUNT(*) FROM transactions)         AS total_transactions,
  (SELECT COUNT(*) FROM transaction_splits)   AS total_splits,
  (SELECT COUNT(*) FROM transactions WHERE linked_transaction_id IS NOT NULL) AS linked_transfers;
