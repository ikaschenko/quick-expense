import { FIXED_HEADERS, SHEET_NAME } from "../constants/expenses";

export type FixedHeaderName = (typeof FIXED_HEADERS)[number];

export interface CurrencyEntry {
  code: string;
  name: string;
}

export interface CurrencyDictionary {
  maxOptional: number;
  currencies: CurrencyEntry[];
}

export interface ExpenseDraft {
  Date: string;
  USD: string;
  Category: string;
  spentBy: string;
  Comment: string;
  /** Dynamic non-USD currency amounts, keyed by currency code. */
  currencyAmounts: Record<string, string>;
  /** Dynamic custom column values, keyed by column name. */
  customFields: Record<string, string>;
}

export interface ExpenseRecord {
  Date: string;
  USD: string;
  Category: string;
  spentBy: string;
  Comment: string;
  /** Dynamic currency amounts (active + archived), keyed by code. */
  currencyAmounts: Record<string, string>;
  /** Dynamic custom column values, keyed by column name. */
  customFields: Record<string, string>;
  rowNumber: number;
}

export interface DistinctValues {
  Category: string[];
  spentBy: string[];
  customFields: Record<string, string[]>;
}

export interface SpreadsheetConfig {
  email: string;
  spreadsheetUrl: string;
  spreadsheetId: string;
  sheetName: typeof SHEET_NAME;
  /** Optional currency codes from sheet header (0–10), in sheet order. */
  currencies: string[];
  /** Custom column names from sheet header (0–10), in sheet order. */
  customColumns: string[];
}

export interface SetupReport {
  tabAction: "created" | "found";
  headersAction: "created" | "migrated" | "valid";
}

export interface ConfigResponse {
  config: SpreadsheetConfig | null;
}

export interface HeaderDetails {
  expected: string[];
  actual: string[];
}

export type HeaderMatchStatus = "match" | "mismatch" | "missing" | "extra";

export interface HeaderRowDetail {
  index: number;
  expected: string;
  actual: string;
  status: HeaderMatchStatus;
}

export type ManualFxRates = Record<string, string>;

export interface FxRateBackupPayload {
  expenseDate: string;
  rates: Record<string, string | null>;
  amounts: Record<string, string>;
}

export interface FxRateBackupRecord {
  rates: Record<string, string | null>;
}

export interface SearchFilters {
  categories: string[];
  comment: string;
}

export type AppErrorKind =
  | "authentication"
  | "authorization"
  | "spreadsheet-not-found"
  | "network"
  | "validation"
  | "unexpected";

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly headerDetails?: HeaderDetails;

  constructor(kind: AppErrorKind, message: string, headerDetails?: HeaderDetails) {
    super(message);
    this.kind = kind;
    this.name = "AppError";
    this.headerDetails = headerDetails;
  }
}

export interface DatasetSnapshot {
  records: ExpenseRecord[];
  distinctValues: DistinctValues;
  loadedAt: number;
  payloadBytes: number;
}

export interface AuthSession {
  email: string;
  lastAuthenticatedAt: number;
  lastActivityAt: number;
}

export interface AuthSessionMeta {
  email: string;
  lastAuthenticatedAt: number;
  lastActivityAt: number;
}
