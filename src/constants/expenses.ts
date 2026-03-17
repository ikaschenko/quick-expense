export const SHEET_NAME = "Expenses";

export const EXPENSE_HEADERS = [
  "Date",
  "PLN",
  "BYN",
  "EUR",
  "USD",
  "Category",
  "WhoSpent",
  "ForWhom",
  "Comment",
  "PaymentChannel",
  "Theme",
] as const;

export const CURRENCY_HEADERS = ["PLN", "BYN", "EUR", "USD"] as const;
export const NON_USD_CURRENCIES = ["PLN", "BYN", "EUR"] as const;
export const MAX_TAIL_RECORDS = 20;
export const MAX_SEARCH_RESULTS = 100;
export const MAX_DATASET_BYTES = 10 * 1024 * 1024;
