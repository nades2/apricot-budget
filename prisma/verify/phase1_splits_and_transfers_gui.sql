-- ============================================================================
--  Phase 1 — Vérifications post-migration (version GUI, sans psql-isms)
--
--  À utiliser avec DBeaver, pgAdmin, TablePlus, ou tout autre client SQL.
--  Exécute chaque bloc individuellement et vérifie le résultat attendu.
--  Un résultat non conforme indique une incohérence à corriger avant Phase 2.
-- ============================================================================


-- ============================================================================
--  Check 1 — Chaque transaction a au moins 1 split
--  Attendu : 0 ligne retournée.
-- ============================================================================

SELECT t.id, t.description, t.amount
FROM transactions t
WHERE NOT EXISTS (
  SELECT 1 FROM transaction_splits s WHERE s.transaction_id = t.id
);


-- ============================================================================
--  Check 2 — La somme des splits égale le montant de la transaction parente
--  Attendu : 0 ligne retournée.
-- ============================================================================

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


-- ============================================================================
--  Check 3 — En Phase 1, chaque transaction a EXACTEMENT 1 split
--  (Deviendra >1 après Phase 2. En Phase 1 on veut =1 pour valider le backfill.)
--  Attendu : 0 ligne retournée.
-- ============================================================================

SELECT
  t.id,
  t.description,
  COUNT(s.id) AS split_count
FROM transactions t
LEFT JOIN transaction_splits s ON s.transaction_id = t.id
GROUP BY t.id, t.description
HAVING COUNT(s.id) <> 1;


-- ============================================================================
--  Check 4 — Cohérence category_id : le split miroir doit avoir la même
--             catégorie que la transaction parente
--  Attendu : 0 ligne retournée.
-- ============================================================================

SELECT
  t.id,
  t.description,
  t.category_id AS tx_category_id,
  s.category_id AS split_category_id
FROM transactions t
JOIN transaction_splits s ON s.transaction_id = t.id
WHERE t.category_id IS DISTINCT FROM s.category_id;


-- ============================================================================
--  Check 5a — linked_transaction_id : aucune transaction pointée par 2+ autres
--  Attendu : 0 ligne retournée.
-- ============================================================================

SELECT linked_transaction_id, COUNT(*) AS pointing_count
FROM transactions
WHERE linked_transaction_id IS NOT NULL
GROUP BY linked_transaction_id
HAVING COUNT(*) > 1;


-- ============================================================================
--  Check 5b — symétrie du lien (A→B implique B→A)
--  Attendu : 0 ligne retournée.
--  (En Phase 1 aucun lien n'est encore créé, donc trivialement vide.)
-- ============================================================================

SELECT
  a.id                    AS a_id,
  a.linked_transaction_id AS a_points_to,
  b.linked_transaction_id AS b_points_to
FROM transactions a
JOIN transactions b ON b.id = a.linked_transaction_id
WHERE b.linked_transaction_id IS DISTINCT FROM a.id;


-- ============================================================================
--  Check 6 — Stats globales (informationnel, aucune assertion)
--  Résultat attendu : 3 nombres. En Phase 1, total_splits == total_transactions
--  et linked_transfers == 0.
-- ============================================================================

SELECT
  (SELECT COUNT(*) FROM transactions)                                          AS total_transactions,
  (SELECT COUNT(*) FROM transaction_splits)                                    AS total_splits,
  (SELECT COUNT(*) FROM transactions WHERE linked_transaction_id IS NOT NULL)  AS linked_transfers;
