-- ============================================================================
--  apricot-budget · initial migration
--  Creates extensions, tables, indexes, and CHECK constraints for the
--  schema declared in prisma/schema.prisma.
--
--  Run manually or via `prisma migrate deploy`.
-- ============================================================================

-- --------------------------------------------------------------------------
--  Extensions
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy matching on descriptions
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive text columns

-- --------------------------------------------------------------------------
--  Enums
-- --------------------------------------------------------------------------
CREATE TYPE "AccountType"        AS ENUM ('ASSET', 'LIABILITY');
CREATE TYPE "AccountSubtype"     AS ENUM (
  'CHECKING','SAVINGS','INVESTMENT','REAL_ESTATE','VEHICLE','OTHER_ASSET',
  'CREDIT_CARD','MORTGAGE','LOAN','LINE_OF_CREDIT','OTHER_LIABILITY'
);
CREATE TYPE "CategoryDirection"  AS ENUM ('EXPENSE','INCOME','TRANSFER','NEUTRAL');
CREATE TYPE "MappingMatchType"   AS ENUM ('EXACT','CONTAINS','PREFIX','REGEX');
CREATE TYPE "ImportStatus"       AS ENUM ('PENDING','MAPPING','CONFIRMED','CANCELLED');

-- --------------------------------------------------------------------------
--  users
-- --------------------------------------------------------------------------
CREATE TABLE "users" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"         citext NOT NULL UNIQUE,
  "password_hash" text   NOT NULL,
  "display_name"  text,
  "locale"        text   NOT NULL DEFAULT 'fr-CA',
  "currency"      text   NOT NULL DEFAULT 'CAD',
  "created_at"    timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"    timestamptz(6) NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
--  accounts (actifs + passifs)
-- --------------------------------------------------------------------------
CREATE TABLE "accounts" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"         uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name"            text NOT NULL,
  "type"            "AccountType"    NOT NULL,
  "subtype"         "AccountSubtype" NOT NULL,
  "institution"     text,
  "account_number"  text,
  "initial_balance" numeric(14,2) NOT NULL DEFAULT 0,
  "currency"        text NOT NULL DEFAULT 'CAD',
  "color"           text,
  "icon"            text,
  "is_archived"     boolean NOT NULL DEFAULT false,
  "created_at"      timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"      timestamptz(6) NOT NULL DEFAULT now(),
  -- Coherence: an ASSET must have an asset-side subtype; same for LIABILITY.
  CONSTRAINT chk_account_subtype_matches_type CHECK (
    (type = 'ASSET' AND subtype IN (
      'CHECKING','SAVINGS','INVESTMENT','REAL_ESTATE','VEHICLE','OTHER_ASSET'))
    OR
    (type = 'LIABILITY' AND subtype IN (
      'CREDIT_CARD','MORTGAGE','LOAN','LINE_OF_CREDIT','OTHER_LIABILITY'))
  )
);
CREATE INDEX idx_accounts_user_archived ON "accounts"("user_id","is_archived");
CREATE INDEX idx_accounts_user_type     ON "accounts"("user_id","type");

-- --------------------------------------------------------------------------
--  categories
--  NULL user_id = global/system category (seeded).
-- --------------------------------------------------------------------------
CREATE TABLE "categories" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"    uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "name"       citext NOT NULL,
  "slug"       citext NOT NULL,
  "direction"  "CategoryDirection" NOT NULL DEFAULT 'EXPENSE',
  "icon"       text,
  "color"      text,
  "is_system"  boolean NOT NULL DEFAULT false,
  "sort_order" int NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
);
-- One slug per user; system categories are (NULL, slug) uniquely.
CREATE UNIQUE INDEX uq_category_user_slug
  ON "categories"(COALESCE("user_id",'00000000-0000-0000-0000-000000000000'), "slug");
CREATE INDEX idx_categories_user ON "categories"("user_id");

-- --------------------------------------------------------------------------
--  transactions
--  Signed amount: negative = debit, positive = credit.
-- --------------------------------------------------------------------------
CREATE TABLE "transactions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"          uuid NOT NULL REFERENCES "users"("id")      ON DELETE CASCADE,
  "account_id"       uuid NOT NULL REFERENCES "accounts"("id")   ON DELETE CASCADE,
  "category_id"      uuid          REFERENCES "categories"("id") ON DELETE SET NULL,
  "csv_import_id"    uuid,          -- FK added after csv_imports is created
  "posted_at"        date  NOT NULL,
  "description"      citext NOT NULL,
  "amount"           numeric(14,2) NOT NULL,
  "imported_balance" numeric(14,2),
  "notes"            text,
  "external_id"      text,
  "is_recurring"     boolean NOT NULL DEFAULT false,
  "created_at"       timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"       timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT chk_amount_nonzero CHECK (amount <> 0)
);
CREATE INDEX idx_tx_user_date    ON "transactions"("user_id","posted_at" DESC);
CREATE INDEX idx_tx_account_date ON "transactions"("account_id","posted_at" DESC);
CREATE INDEX idx_tx_category     ON "transactions"("category_id");
CREATE INDEX idx_tx_import       ON "transactions"("csv_import_id");
-- Dedup: prevent the exact same movement from being imported twice.
-- external_id can be NULL, so use NULLS NOT DISTINCT (PG 15+).
CREATE UNIQUE INDEX uq_tx_dedup
  ON "transactions"("account_id","posted_at","amount","external_id")
  NULLS NOT DISTINCT;

-- --------------------------------------------------------------------------
--  csv_imports
-- --------------------------------------------------------------------------
CREATE TABLE "csv_imports" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id")    ON DELETE CASCADE,
  "account_id"   uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "filename"     text NOT NULL,
  "file_hash"    text NOT NULL,
  "row_count"    int  NOT NULL,
  "mapped_count" int  NOT NULL DEFAULT 0,
  "status"       "ImportStatus" NOT NULL DEFAULT 'PENDING',
  "raw_payload"  jsonb,
  "errors"       jsonb,
  "uploaded_at"  timestamptz(6) NOT NULL DEFAULT now(),
  "confirmed_at" timestamptz(6)
);
CREATE UNIQUE INDEX uq_import_hash ON "csv_imports"("user_id","file_hash");
CREATE INDEX idx_imports_user_date ON "csv_imports"("user_id","uploaded_at" DESC);

ALTER TABLE "transactions"
  ADD CONSTRAINT fk_tx_csv_import
  FOREIGN KEY ("csv_import_id") REFERENCES "csv_imports"("id") ON DELETE SET NULL;

-- --------------------------------------------------------------------------
--  csv_mapping_rules — description → category
-- --------------------------------------------------------------------------
CREATE TABLE "csv_mapping_rules" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid NOT NULL REFERENCES "users"("id")      ON DELETE CASCADE,
  "category_id"  uuid NOT NULL REFERENCES "categories"("id") ON DELETE CASCADE,
  "match_type"   "MappingMatchType" NOT NULL DEFAULT 'EXACT',
  "pattern"      citext NOT NULL,
  "priority"     int NOT NULL DEFAULT 100,
  "auto_created" boolean NOT NULL DEFAULT false,
  "times_used"   int NOT NULL DEFAULT 0,
  "last_used_at" timestamptz(6),
  "created_at"   timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"   timestamptz(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_rule_user_pattern
  ON "csv_mapping_rules"("user_id","match_type","pattern");
CREATE INDEX idx_rules_user_priority
  ON "csv_mapping_rules"("user_id","priority" DESC);
-- Fuzzy matching on bank descriptions.
CREATE INDEX idx_rules_pattern_trgm
  ON "csv_mapping_rules" USING gin ("pattern" gin_trgm_ops);
CREATE INDEX idx_tx_description_trgm
  ON "transactions" USING gin ("description" gin_trgm_ops);

-- --------------------------------------------------------------------------
--  Auto-update `updated_at` triggers
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','accounts','categories','transactions','csv_mapping_rules'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at
         BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t);
  END LOOP;
END $$;
