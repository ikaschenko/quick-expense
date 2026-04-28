export const SHEET_NAME = "Expenses";

/** Fixed (non-currency) columns that always appear in every sheet. */
export const FIXED_HEADERS = [
  "Date",
  "USD",
  "Category",
  "WhoSpent",
  "ForWhom",
  "Comment",
  "PaymentChannel",
  "Theme",
] as const;

/** Fixed headers that appear AFTER the currency block (USD onwards). */
export const POST_CURRENCY_HEADERS = [
  "USD",
  "Category",
  "WhoSpent",
  "ForWhom",
  "Comment",
  "PaymentChannel",
  "Theme",
] as const;

/**
 * Build the full header row for a sheet given the currency codes
 * that appear between Date and USD (in sheet order).
 */
export function buildExpenseHeaders(sheetCurrencies: string[]): string[] {
  return ["Date", ...sheetCurrencies, ...POST_CURRENCY_HEADERS];
}

export const MAX_TAIL_RECORDS = 20;
export const MAX_SEARCH_RESULTS = 100;
export const MAX_DATASET_BYTES = 10 * 1024 * 1024;
