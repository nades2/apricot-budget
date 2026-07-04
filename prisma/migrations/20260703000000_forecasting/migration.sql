-- ============================================================================
--  apricot-budget · forecasting migration
--  Ajoute le support de la prévision cashflow "PocketSmith-style" :
--    - point d'ancrage temporel du solde initial des comptes
--    - RRULE (RFC 5545) + autoConfirm sur les budget_items
--    - table scheduled_instances : occurrences matérialisées avec réconciliation
--
--  Run manually or via `prisma migrate deploy`.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
--  Enum : statut d'une occurrence projetée
-- --------------------------------------------------------------------------
CREATE TYPE "ScheduledInstanceStatus" AS ENUM (
  'PROJECTED',   -- attendue, non rapprochée
  'REALIZED',    -- matchée avec une vraie transaction
  'SKIPPED',     -- attendue mais non survenue
  'CANCELLED'    -- annulée manuellement
);

-- --------------------------------------------------------------------------
--  accounts : ajout de la date d'ancrage du solde initial
--  Nécessaire pour que le ForecastService sache "à partir de quand" appliquer
--  les transactions réelles postérieures au solde d'ouverture.
-- --------------------------------------------------------------------------
ALTER TABLE "accounts"
  ADD COLUMN "initial_balance_date" date NOT NULL DEFAULT CURRENT_DATE;

-- Pour les comptes existants, on prend leur date de création comme meilleure
-- approximation (mieux que "aujourd'hui" qui invaliderait l'historique).
UPDATE "accounts"
   SET "initial_balance_date" = ("created_at"::date)
 WHERE "initial_balance_date" = CURRENT_DATE;

-- --------------------------------------------------------------------------
--  budget_items : passage à un modèle RRULE + réconciliation
-- --------------------------------------------------------------------------
ALTER TABLE "budget_items"
  ADD COLUMN "rrule"        text,
  ADD COLUMN "dtstart"      date,
  ADD COLUMN "auto_confirm" boolean NOT NULL DEFAULT true,
  ADD COLUMN "confidence"   integer NOT NULL DEFAULT 100;

-- Garde-fou : la confiance est un pourcentage.
ALTER TABLE "budget_items"
  ADD CONSTRAINT chk_budget_item_confidence
  CHECK ("confidence" BETWEEN 0 AND 100);

-- Garde-fou : si une RRULE est fournie, elle doit commencer par "FREQ=".
-- Validation légère seulement; la validation stricte est côté NestJS (rrule).
ALTER TABLE "budget_items"
  ADD CONSTRAINT chk_budget_item_rrule_shape
  CHECK ("rrule" IS NULL OR "rrule" ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)');

-- --------------------------------------------------------------------------
--  scheduled_instances : occurrences matérialisées
--  Créées par le ForecastService dès qu'une occurrence est éditée, ou par
--  le ReconciliationService quand un CSV import matche une projection.
-- --------------------------------------------------------------------------
CREATE TABLE "scheduled_instances" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "budget_item_id"         uuid NOT NULL REFERENCES "budget_items"("id") ON DELETE CASCADE,
  "expected_date"          date NOT NULL,
  "expected_amount"        numeric(14,2) NOT NULL,
  "status"                 "ScheduledInstanceStatus" NOT NULL DEFAULT 'PROJECTED',
  "matched_transaction_id" uuid REFERENCES "transactions"("id") ON DELETE SET NULL,
  "notes"                  text,
  "created_at"             timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"             timestamptz(6) NOT NULL DEFAULT now(),

  -- Une transaction ne peut satisfaire qu'une seule occurrence.
  CONSTRAINT uq_instance_matched_tx UNIQUE ("matched_transaction_id"),
  -- Pas deux occurrences le même jour pour la même règle.
  CONSTRAINT uq_instance_item_date  UNIQUE ("budget_item_id","expected_date"),
  -- Cohérence : REALIZED exige un match; les autres statuts non.
  CONSTRAINT chk_instance_realized_has_match CHECK (
    ("status" = 'REALIZED' AND "matched_transaction_id" IS NOT NULL)
    OR
    ("status" <> 'REALIZED')
  )
);

-- Index principal pour les fenêtres du calendrier (jour/semaine/mois).
CREATE INDEX idx_scheduled_instances_date_status
  ON "scheduled_instances"("expected_date","status");

-- NB: la recherche par règle est déjà couverte par l'index implicite de
-- la contrainte UNIQUE uq_instance_item_date (budget_item_id, expected_date).

COMMIT;
