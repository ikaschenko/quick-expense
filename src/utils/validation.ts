import { EXPENSE_HEADERS, NON_USD_CURRENCIES } from "../constants/expenses";
import { AppError, CurrencyCode, ExpenseDraft, NonUsdCurrencyCode } from "../types/expense";

export type ExpenseValidationErrors = Partial<Record<(typeof EXPENSE_HEADERS)[number], string>>;

const decimalPattern = /^-?\d+(\.\d+)?$/;
const positiveDecimalPattern = /^\d+([.,]\d+)?$/;

export function parseOptionalDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!decimalPattern.test(trimmed)) {
    throw new AppError("validation", "Currency fields accept decimal numbers with dot separator.");
  }

  return Number(trimmed);
}

export function parsePositiveDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (!positiveDecimalPattern.test(trimmed)) {
    throw new AppError(
      "validation",
      "FX rate fields accept positive numbers using dot or comma separator.",
    );
  }

  return Number(trimmed.replace(",", "."));
}

export function validateExpenseDraft(draft: ExpenseDraft): ExpenseValidationErrors {
  const errors: ExpenseValidationErrors = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.Date)) {
    errors.Date = "Date must be in ISO format YYYY-MM-DD.";
  }

  const currencyKeys: CurrencyCode[] = ["PLN", "BYN", "USD", "EUR"];
  const filledNonUsdCurrencies: NonUsdCurrencyCode[] = [];
  let atLeastOneCurrency = false;

  for (const currency of currencyKeys) {
    try {
      const parsedValue = parseOptionalDecimal(draft[currency]);
      if (parsedValue !== null) {
        atLeastOneCurrency = true;

        if ((NON_USD_CURRENCIES as readonly string[]).includes(currency)) {
          filledNonUsdCurrencies.push(currency as NonUsdCurrencyCode);
        }
      }
    } catch (error) {
      errors[currency] = (error as Error).message;
    }
  }

  if (!atLeastOneCurrency) {
    errors.USD = "Provide at least one currency amount.";
  }

  if (filledNonUsdCurrencies.length > 1) {
    const message = "Only one of PLN, BYN, or EUR can be filled at a time.";

    filledNonUsdCurrencies.forEach((currency) => {
      errors[currency] = message;
    });
  }

  if (!draft.Category.trim()) {
    errors.Category = "Category is required.";
  }

  if (!draft.WhoSpent.trim()) {
    errors.WhoSpent = "WhoSpent is required.";
  }

  return errors;
}
