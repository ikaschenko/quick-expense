import { AppError, ExpenseDraft } from "../types/expense";

export type ExpenseValidationErrors = Record<string, string>;

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

export function validateExpenseDraft(
  draft: ExpenseDraft,
  activeCurrencies: string[],
): ExpenseValidationErrors {
  const errors: ExpenseValidationErrors = {};

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.Date)) {
    errors.Date = "Date must be in ISO format YYYY-MM-DD.";
  }

  const filledNonUsdCurrencies: string[] = [];
  let atLeastOneCurrency = false;

  // Check USD
  try {
    const usdValue = parseOptionalDecimal(draft.USD);
    if (usdValue !== null) {
      atLeastOneCurrency = true;
    }
  } catch (error) {
    errors.USD = (error as Error).message;
  }

  // Check dynamic non-USD currencies
  for (const code of activeCurrencies) {
    const raw = draft.currencyAmounts[code] ?? "";
    try {
      const parsedValue = parseOptionalDecimal(raw);
      if (parsedValue !== null) {
        atLeastOneCurrency = true;
        filledNonUsdCurrencies.push(code);
      }
    } catch (error) {
      errors[code] = (error as Error).message;
    }
  }

  if (!atLeastOneCurrency) {
    errors.USD = "Provide at least one currency amount.";
  }

  if (filledNonUsdCurrencies.length > 1) {
    const names = activeCurrencies.join(", ");
    const message = `Only one of ${names} can be filled at a time.`;
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
