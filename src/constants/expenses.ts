export const SHEET_NAME = "Expenses";

/** Fixed (non-currency) columns that always appear in every sheet. */
export const FIXED_HEADERS = [
  "Date",
  "USD",
  "Category",
  "Spent By",
  "Comment",
] as const;

/** Fixed headers that appear AFTER the currency block (USD onwards). */
export const POST_CURRENCY_HEADERS = [
  "USD",
  "Category",
  "Spent By",
  "Comment",
] as const;

/** Reserved column names that cannot be used for custom columns (case-insensitive match). */
export const RESERVED_COLUMN_NAMES = ["Date", "USD", "Category", "Spent By", "Comment"] as const;

export const MAX_CUSTOM_COLUMNS = 10;

/**
 * Build the full header row for a sheet given the currency codes
 * that appear between Date and USD (in sheet order), and custom column names.
 */
export function buildExpenseHeaders(sheetCurrencies: string[], customColumns: string[] = []): string[] {
  return ["Date", ...sheetCurrencies, ...POST_CURRENCY_HEADERS, ...customColumns];
}

/** QuickExpense fields that must be mapped in the column mapping editor. */
export const REQUIRED_QE_FIELDS = ["Date", "USD", "Category", "Spent By", "Comment"] as const;

export const HISTORY_PAGE_SIZE = 50;
export const FILTER_DEBOUNCE_MS = 2500;
export const MAX_SEARCH_RESULTS = 100;
export const MAX_DATASET_BYTES = 10 * 1024 * 1024;
