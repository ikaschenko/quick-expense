import { NON_USD_CURRENCIES } from "../constants/expenses";
import { AppError, ManualFxRates, NonUsdCurrencyCode } from "../types/expense";
import { parsePositiveDecimal } from "../utils/validation";

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

export const currencyService = {
  parseManualFxRates(rates: ManualFxRates): Partial<Record<NonUsdCurrencyCode, number>> {
    return {
      PLN: parsePositiveDecimal(rates.PLN) ?? undefined,
      BYN: parsePositiveDecimal(rates.BYN) ?? undefined,
      EUR: parsePositiveDecimal(rates.EUR) ?? undefined,
    };
  },

  convertToUsdFromRates(
    values: Partial<Record<NonUsdCurrencyCode, number>>,
    rates: Partial<Record<NonUsdCurrencyCode, number>>,
  ): number {
    const populatedCurrencies = NON_USD_CURRENCIES.filter(
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
