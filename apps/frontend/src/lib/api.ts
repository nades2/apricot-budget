/**
 * Thin typed fetch wrapper. All calls go through Vite's /api proxy in dev
 * (see vite.config.ts) and hit `${VITE_API_URL}` in prod.  Attaches the JWT
 * Bearer token from the current session and clears it on 401 so the shell
 * can redirect back to /login.
 */
import { clearSession, getSession } from './auth';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const s = getSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(s ? { Authorization: `Bearer ${s.token}` } : {}),
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  });
  if (res.status === 401) {
    clearSession();
    throw new Error('Session expirée. Reconnecte-toi.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /**
   * multipart/form-data upload. Do NOT set Content-Type ourselves — the browser
   * sets it with the correct boundary when we pass a FormData body.
   */
  postForm: async <T>(path: string, form: FormData): Promise<T> => {
    const s = getSession();
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      body: form,
      headers: s ? { Authorization: `Bearer ${s.token}` } : undefined,
      credentials: 'include',
    });
    if (res.status === 401) {
      clearSession();
      throw new Error('Session expirée. Reconnecte-toi.');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  },
};

// --- Extra shared types for the import wizard -----------------------------

export type MappingSource = 'user_rule' | 'bank_category' | 'similar_history' | 'none';

export type PreviewRow = {
  rowIndex: number;
  postedAt: string;
  description: string;
  bankCategory: string;
  amount: string;
  /** null pour le format carte de crédit (pas de colonne Solde). */
  runningBalance: string | null;
  informational: boolean;
  parseError?: string;
  suggestion: {
    suggestedCategoryId: string | null;
    suggestedCategoryName: string | null;
    confidence: number;
    source: MappingSource;
  };
};

export type CsvImport = {
  id: string;
  userId: string;
  accountId: string;
  filename: string;
  fileHash: string;
  rowCount: number;
  mappedCount: number;
  status: 'PENDING' | 'MAPPING' | 'CONFIRMED' | 'CANCELLED';
  rawPayload: PreviewRow[] | null;
  errors: unknown;
  uploadedAt: string;
  confirmedAt: string | null;
  /** Décorateurs renvoyés par `GET /csv-imports` uniquement. */
  account?: { id: string; name: string };
  txCount?: number;              // nb de transactions encore rattachées
  minPostedAt?: string | null;   // YYYY-MM-DD
  maxPostedAt?: string | null;   // YYYY-MM-DD
};

export type Category = {
  id: string;
  userId: string | null;
  name: string;
  slug: string;
  direction: CategoryDirection;
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  sortOrder: number;
};

export type Account = {
  id: string;
  name: string;
  type: 'ASSET' | 'LIABILITY';
  subtype: string;
  institution: string | null;
  currency: string;
  initialBalance: string;
  currentBalance: string;
};

// --- Budget module --------------------------------------------------------

export type BudgetDirection = 'EXPENSE' | 'INCOME';
export type BudgetRecurrence = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY' | 'ONCE';

export type BudgetItem = {
  id: string;
  userId: string;
  categoryId: string;
  accountId: string | null;
  name: string;
  direction: BudgetDirection;
  amount: string;
  currency: string;
  recurrence: BudgetRecurrence;
  anchorDate: string;
  endDate: string | null;
  rrule: string | null;
  dtstart: string | null;
  isActive: boolean;
  notes: string | null;
  category: Category;
  account: { id: string; name: string } | null;
};

export type BudgetPreset = {
  key: string;
  name: string;
  categorySlug: string;
  categoryId: string | null;
  direction: BudgetDirection;
  amount: number;
  recurrence: BudgetRecurrence;
  emoji: string;
  /** RRULE (RFC 5545) optionnelle. Prend priorité sur recurrence quand définie. */
  rrule?: string;
  /** Ancre annuelle fixe (1-12 / 1-31). Utilisée pour calculer anchorDate. */
  anchorMonth?: number;
  anchorDay?: number;
};

// --- Taxes bundle --------------------------------------------------------

export type TaxBundleKind = 'scolaire' | 'municipale';

export type TaxBundleDate = {
  label: string;
  month: number;
  day: number;
};

export type TaxBundle = {
  kind: TaxBundleKind;
  displayName: string;
  categorySlug: string;
  emoji: string;
  defaultAnnualAmount: number;
  dates: TaxBundleDate[];
};

export type CreateTaxesBundleResult = {
  bundle: TaxBundleKind;
  year: number;
  total: number;
  items: BudgetItem[];
};

export type BudgetLine = {
  itemId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  direction: BudgetDirection;
  amountPerOccurrence: string;
  occurrences: number;
  planned: string;
  actual: string;
  variance: string;
  status: 'ok' | 'over' | 'under' | 'missing';
};

/**
 * Ligne "Hors budget" : catégorie non budgétée ayant des transactions dans
 * le mois, ou row synthétique "Non catégorisées" (categoryId=null).
 */
export type UnbudgetedLine = {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  actual: string;        // absolu pour affichage
  count: number;
};

export type BudgetReport = {
  month: string;
  from: string;
  to: string;
  income: {
    planned: string;
    /** Réel scope budgété (somme des lines.actual, remboursements nettés). */
    actual: string;
    /** Réel total = actual + total hors budget. Vrai cashflow entrant. */
    actualTotal: string;
    lines: BudgetLine[];
  };
  expense: {
    planned: string;
    actual: string;
    actualTotal: string;
    lines: BudgetLine[];
  };
  /** Catégories ayant des transactions ce mois-ci mais aucun BudgetItem. */
  unbudgetedExpense: { total: string; lines: UnbudgetedLine[] };
  unbudgetedIncome:  { total: string; lines: UnbudgetedLine[] };
  /**
   * Transactions dans une catégorie "staging" (ex. Remboursement) qui
   * attendent une reclassification manuelle. Non comptées dans les rapports.
   */
  staging: { total: string; lines: UnbudgetedLine[] };
  net: {
    planned: string;
    actual: string;                // scope budgété
    actualTotal: string;           // + hors budget
    variance: string;              // actual - planned
    varianceTotal: string;         // actualTotal - planned
    verdict: 'positive' | 'negative' | 'neutral';
    verdictTotal: 'positive' | 'negative' | 'neutral';
  };
};

// ---------- Types shared with the backend ---------------------------------
// (would go into packages/shared-types later; inlined for now)

export type CategoryDirection = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'NEUTRAL';

export type MatchedPlanned = {
  budgetItemId: string;
  name: string;
  plannedAmount: string;
  delta: string;
  deltaStatus: 'ok' | 'over' | 'under';
};

export type CalendarSplit = {
  id: string;
  amount: string;                    // signed Decimal string
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    direction: CategoryDirection;
  } | null;
};

export type CalendarTx = {
  id: string;
  description: string;
  amount: string;                    // signed Decimal string
  category: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    direction: CategoryDirection;
  } | null;
  splits: CalendarSplit[];           // ≥1 après Phase 1
  matchedPlanned?: MatchedPlanned;
  /**
   * ID de la contrepartie si la transaction fait partie d'une paire de
   * transfert (paiement CC, virement inter-comptes). Non-null → exclue des
   * totaux debit/credit/net calculés côté serveur.
   */
  linkedTransactionId?: string | null;
};

export type PlannedGhost = {
  budgetItemId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  categoryIcon: string | null;
  direction: 'EXPENSE' | 'INCOME';
  plannedAmount: string;
};

export type OverflowItem = {
  kind: 'tx' | 'ghost';
  name: string;
  amountSigned: string;              // signed Decimal string
};

export type CalendarDay = {
  date: string;                      // YYYY-MM-DD
  totalDebit: string;
  totalCredit: string;
  net: string;
  txCount: number;
  transactions: CalendarTx[];
  overflowCount: number;
  overflowItems: OverflowItem[];
  plannedGhosts: PlannedGhost[];
};

export type CalendarResponse = {
  from: string;
  to: string;
  days: CalendarDay[];
  totals: { debit: string; credit: string; net: string };
};

// --- Forecast module ------------------------------------------------------

export type ScheduledStatus = 'PROJECTED' | 'REALIZED' | 'SKIPPED' | 'CANCELLED';

export type ForecastEntry = {
  budgetItemId: string;
  name: string;
  categoryId: string;
  direction: BudgetDirection;
  amount: string;              // signé
  status: ScheduledStatus;
  instanceId?: string;
};

export type ForecastDay = {
  date: string;                // YYYY-MM-DD
  realizedDelta: string;
  projectedDelta: string;
  netDelta: string;
  balance: string;
  entries: ForecastEntry[];
  belowThreshold: boolean;
};

export type ForecastResponse = {
  accountId: string;
  currency: string;
  from: string;
  to: string;
  openingBalance: string;
  closingBalance: string;
  lowBalanceThreshold: string | null;
  days: ForecastDay[];
};

// --- Recurrence detector --------------------------------------------------

export type DetectedRecurrence = {
  key: string;
  suggestedName: string;
  normalizedDescription: string;
  matchingDescriptions: string[];
  direction: BudgetDirection;
  recurrence: BudgetRecurrence;
  avgAmount: string;
  amountStdev: string;
  medianIntervalDays: number;
  intervalStdevDays: number;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected: string;
  confidence: number;             // 0-100
  categoryId: string | null;
  suggestedTransactionIds: string[];
};

export type AcceptCandidatePayload = {
  candidate: DetectedRecurrence;
  overrides?: {
    name?: string;
    categoryId?: string;
    accountId?: string | null;
    amount?: string;
    anchorDate?: string;
  };
};


// --- Forecast alerts (J-7 belowThreshold) ---------------------------------

export type ForecastAlert = {
  accountId: string;
  accountName: string;
  currency: string;
  firstBelowDate: string;
  daysUntil: number;
  projectedBalance: string;
  lowBalanceThreshold: string;
  severity: 'imminent' | 'soon' | 'watch';
};
