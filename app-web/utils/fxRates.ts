import { ExpenseRecord, ManualFxRates } from "../types/expense";

export function deriveAverageFxRatesForDate(
  records: ExpenseRecord[],
  targetDate: string,
  currencies: string[],
  normalizeDate: (date: string) => string = (date) => date,
): ManualFxRates {
  const ratios = new Map<string, number[]>();
  for (const code of currencies) ratios.set(code, []);

  for (const record of records) {
    if (record.Date !== targetDate && normalizeDate(record.Date) !== normalizeDate(targetDate)) continue;
    const usd = Number.parseFloat(record.USD);
    if (!Number.isFinite(usd) || usd === 0) continue;

    for (const code of currencies) {
      const amount = Number.parseFloat(record.currencyAmounts[code] ?? "");
      if (!Number.isFinite(amount) || amount === 0) continue;
      ratios.get(code)!.push(Math.abs(amount) / Math.abs(usd));
    }
  }

  const rates: ManualFxRates = {};
  for (const code of currencies) {
    const values = ratios.get(code)!;
    rates[code] = values.length > 0
      ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)
      : "";
  }
  return rates;
}