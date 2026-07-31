import { ExpenseRecord } from "../types/expense";

export interface DualCurrency {
  code: string;
  amount: number;
}

export interface DayTotal {
  usdTotal: number;
  dualCurrency: DualCurrency | null;
}

/**
 * Parse a raw number string from a Google Sheet cell.
 * Handles: currency symbols ($€£¥), whitespace, US thousands ("1,234.56"),
 * European format ("1.234,56"), and plain decimals ("1234.56").
 * The last separator character determines which is the decimal point.
 */
export function parseRawNumber(raw: string): number {
  let s = String(raw).trim().replace(/[$€£¥]/g, "").trim();
  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastDot > lastComma) {
      // US format: "1,234.56" — dot is decimal, strip thousands commas
      s = s.replaceAll(",", "");
    } else {
      // European format: "1.234,56" — comma is decimal, strip thousands dots
      s = s.replaceAll(".", "").replace(",", ".");
    }
  } else if (lastComma !== -1) {
    // Only comma: thousands separator if digits come in groups of 3 (e.g. "1,234"), else decimal
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replaceAll(",", "") : s.replace(",", ".");
  }
  // else: only dot or no separator — already correct

  return Number.parseFloat(s) || 0;
}

export function parseUsd(record: ExpenseRecord): number {
  return parseRawNumber(record.USD);
}

export function parseAmount(value: string): number {
  return parseRawNumber(String(value));
}

/**
 * Dual-currency display: ALL given records share exactly one non-USD code AND
 * each has USD > 0.
 */
export function computeDualCurrency(records: ExpenseRecord[]): DualCurrency | null {
  if (records.length === 0) return null;

  let commonCode: string | null = null;
  let totalNonUsd = 0;

  for (const r of records) {
    if (!(parseUsd(r) > 0)) return null;

    const nonUsdEntries = Object.entries(r.currencyAmounts).filter(([, v]) => {
      const n = parseAmount(v);
      return !Number.isNaN(n) && n !== 0;
    });

    if (nonUsdEntries.length !== 1) return null;

    const [code, value] = nonUsdEntries[0];
    if (commonCode === null) commonCode = code;
    else if (commonCode !== code) return null;

    totalNonUsd += parseAmount(value);
  }

  return commonCode ? { code: commonCode, amount: totalNonUsd } : null;
}

/** Sums USD total and computes optional dual-currency total for a set of records (e.g. one day's transactions). */
export function computeDayTotal(records: ExpenseRecord[]): DayTotal {
  const usdTotal = records.reduce((sum, r) => sum + parseUsd(r), 0);
  return { usdTotal, dualCurrency: computeDualCurrency(records) };
}
