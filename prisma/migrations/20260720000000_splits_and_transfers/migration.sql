-- ============================================================================
--  apricot-budget · Phase 1 — Splits & Transfers foundation
--
--  Goals (invisible to the end user):
--    1. Introduce a `transaction_splits` table so a transaction can carry
--       N categorized lines. Each existing transaction is backfilled with
--       exactly ONE split whose (category_id, amount) mirror the parent row.
--    2. Add a self-referencing `linked_transaction_id` FK on `transactions`
--       so paired transfer transactions (checking ↔ credit card) can be
--       linked as siblings. Not yet used — plumbing only.
--
--  Nothing is dropped. Reads still use `transactions.category_id`. The
--  application code writes splits in parallel from this point on, keeping
--  the two representations in lock-step until Phase 2 flips reads over.
-- ============================================================================

-- --------------------------------------------------------------------------
--  1) transaction_splits
-- --------------------------------------------------------------------------
CREATE TABLE "transaction_splits" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "transaction_id" uuid NOT NULL REFERENCES "transactions"("id") ON DELETE CASCADE,
  "category_id"    uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  -- Signed, same convention as parent: negative = money out, positive = money in.
  "amount"         numeric(14,2) NOT NULL,
  "notes"          text,
  "sort_order"     int NOT NULL DEFAULT 0,
  "created_at"     timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"     timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX idx_splits_tx       ON "transaction_splits"("transaction_id");
CREATE INDEX idx_splits_category ON "transaction_splits"("category_id");

-- --------------------------------------------------------------------------
--  2) linked_transaction_id — transfer pairing (symmetrical 1:1)
--
--  Both sides of a transfer point at each other. The partial unique index
--  guarantees a given transaction can only be the counterpart of ONE other
--  transaction (no accidental many-to-one links). NULL means "not a
--  transfer" — the vast majority of rows.
-- --------------------------------------------------------------------------
ALTER TABLE "transactions"
  ADD COLUMN "linked_transaction_id" uuid REFERENCES "transactions"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_tx_linked
  ON "transactions"("linked_transaction_id")
  WHERE "linked_transaction_id" IS NOT NULL;

-- --------------------------------------------------------------------------
--  3) Backfill — one split per existing transaction
--
--  Copies (category_id, amount) verbatim. sort_order=0 for the single split.
--  Runs inside the migration transaction, so if it fails, nothing above
--  is committed. Idempotent: only inserts where no split exists yet
--  (safe if the migration is re-run against a partially-migrated DB).
-- --------------------------------------------------------------------------
INSERT INTO "transaction_splits" ("transaction_id", "category_id", "amount", "sort_order")
SELECT t."id", t."category_id", t."amount", 0
FROM "transactions" t
WHERE NOT EXISTS (
  SELECT 1 FROM "transaction_splits" s WHERE s."transaction_id" = t."id"
);
