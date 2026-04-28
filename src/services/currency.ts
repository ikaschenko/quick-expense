import { AppError, ManualFxRates } from "../types/expense";
import { parsePositiveDecimal } from "../utils/validation";

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export const currencyService = {
  parseManualFxRates(
    rates: ManualFxRates,
    currencies: string[],
  ): Partial<Record<string, number>> {
    const parsed: Partial<Record<string, number>> = {};
    for (const code of currencies) {
      const raw = rates[code];
      if (raw !== undefined) {
        parsed[code] = parsePositiveDecimal(raw) ?? undefined;
      }
    }
    return parsed;
  },

  convertToUsdFromRates(
    values: Partial<Record<string, number>>,
    rates: Partial<Record<string, number>>,
    currencies: string[],
  ): number {
    const populatedCurrencies = currencies.filter(
      (currency) => values[currency] !== undefined && values[currency] !== 0,
    );

    if (populatedCurrencies.length === 0) {
      return 0;
    }

    let usdTotal = 0;

    for (const currency of populatedCurrencies) {
      const amount = values[currency];
      const rate = rates[currency];

      if (amount === undefined || amount === 0) {
        continue;
      }

      if (!rate) {
        throw new AppError(
          "validation",
          `Provide a USD rate for ${currency} or enter USD manually.`,
        );
      }

      usdTotal += amount / rate;
    }

    return roundUsd(usdTotal);
  },
};
