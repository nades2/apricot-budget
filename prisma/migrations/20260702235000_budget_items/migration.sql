-- Budget items · récurrents planifiés
CREATE TYPE "BudgetDirection"  AS ENUM ('EXPENSE','INCOME');
CREATE TYPE "BudgetRecurrence" AS ENUM ('DAILY','WEEKLY','BIWEEKLY','MONTHLY','YEARLY','ONCE');

CREATE TABLE "budget_items" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     uuid NOT NULL REFERENCES "users"("id")      ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  "account_id"  uuid          REFERENCES "accounts"("id")   ON DELETE SET NULL,
  "name"        text NOT NULL,
  "direction"   "BudgetDirection"  NOT NULL,
  "amount"      numeric(14,2)      NOT NULL CHECK (amount >= 0),
  "currency"    text               NOT NULL DEFAULT 'CAD',
  "recurrence"  "BudgetRecurrence" NOT NULL,
  "anchor_date" date               NOT NULL,
  "end_date"    date,
  "is_active"   boolean            NOT NULL DEFAULT true,
  "notes"       text,
  "created_at"  timestamptz(6)     NOT NULL DEFAULT now(),
  "updated_at"  timestamptz(6)     NOT NULL DEFAULT now()
);
CREATE INDEX idx_budget_items_user_active   ON "budget_items"("user_id","is_active");
CREATE INDEX idx_budget_items_user_category ON "budget_items"("user_id","category_id");

CREATE TRIGGER trg_budget_items_updated_at
  BEFORE UPDATE ON "budget_items"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
