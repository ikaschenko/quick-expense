import { CURRENCY_HEADERS, EXPENSE_HEADERS, SHEET_NAME } from "../constants/expenses";

export type CurrencyCode = (typeof CURRENCY_HEADERS)[number];
export type HeaderName = (typeof EXPENSE_HEADERS)[number];
export type NonUsdCurrencyCode = Exclude<CurrencyCode, "USD">;

export interface ExpenseDraft {
  Date: string;
  PLN: string;
  BYN: string;
  USD: string;
  EUR: string;
  Category: string;
  WhoSpent: string;
  ForWhom: string;
  Comment: string;
  PaymentChannel: string;
  Theme: string;
}

export interface ExpenseRecord extends ExpenseDraft {
  rowNumber: number;
}

export interface DistinctValues {
  Category: string[];
  WhoSpent: string[];
  ForWhom: string[];
  PaymentChannel: string[];
  Theme: string[];
}

export interface SpreadsheetConfig {
  email: string;
  spreadsheetUrl: string;
  spreadsheetId: string;
  sheetName: typeof SHEET_NAME;
}

export interface ManualFxRates {
  PLN: string;
  BYN: string;
  EUR: string;
}

export interface FxRateBackupPayload {
  expenseDate: string;
  rates: {
    PLN: string | null;
    BYN: string | null;
    EUR: string | null;
  };
  amounts: {
    PLN: string;
    BYN: string;
    EUR: string;
    USD: string;
  };
}

export interface FxRateBackupRecord extends FxRateBackupPayload {
  submittedAt: string;
  spreadsheetId: string | null;
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

  constructor(kind: AppErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "AppError";
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
