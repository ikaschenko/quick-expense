import { detectDateFormat } from "./date";
import { ExpenseRecord } from "../types/expense";

export type IsoNormalizer = (raw: string) => string | null;

export interface TodayStats {
  count: number;
  usdTotal: number;
  dualCurrency: { code: string; amount: number } | null;
}

export interface PeriodStats {
  count: number;
  usdTotal: number;
  deviation: {
    up: boolean;
    pctChange: number;
    absChange: number;
    priorLabel: string;
  } | null;
}

/** Build a date normalizer from a dataset's records (auto-detects sheet date format). */
export function buildIsoNormalizer(records: ExpenseRecord[]): IsoNormalizer {
  const fmt = detectDateFormat(records.map((r) => r.Date));
  return (raw: string) => {
    if (fmt) return fmt.toIso(raw);
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  };
}

/**
 * Parse a raw number string from a Google Sheet cell.
 * Handles: currency symbols ($€£¥), whitespace, US thousands ("1,234.56"),
 * European format ("1.234,56"), and plain decimals ("1234.56").
 * The last separator character determines which is the decimal point.
 */
function parseRawNumber(raw: string): number {
  let s = String(raw).trim().replace(/[$€£¥]/g, "").trim();
  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastDot > lastComma) {
      // US format: "1,234.56" — dot is decimal, strip thousands commas
      s = s.replace(/,/g, "");
    } else {
      // European format: "1.234,56" — comma is decimal, strip thousands dots
      s = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (lastComma !== -1) {
    // Only comma: thousands separator if digits come in groups of 3 (e.g. "1,234"), else decimal
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  // else: only dot or no separator — already correct

  return parseFloat(s) || 0;
}

function parseUsd(record: ExpenseRecord): number {
  return parseRawNumber(record.USD);
}

function parseAmount(value: string): number {
  return parseRawNumber(String(value));
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** TODAY card stats. */
export function getTodayStats(
  records: ExpenseRecord[],
  todayStr: string,
  toIso: IsoNormalizer,
): TodayStats {
  const todayRecords = records.filter((r) => toIso(r.Date) === todayStr);
  const count = todayRecords.length;
  const usdTotal = todayRecords.reduce((sum, r) => sum + parseUsd(r), 0);

  return { count, usdTotal, dualCurrency: computeDualCurrency(todayRecords) };
}

/**
 * Dual-currency display: ALL today's records share exactly one non-USD code AND
 * each has USD > 0.
 */
function computeDualCurrency(records: ExpenseRecord[]): TodayStats["dualCurrency"] {
  if (records.length === 0) return null;

  let commonCode: string | null = null;
  let totalNonUsd = 0;

  for (const r of records) {
    if (!(parseUsd(r) > 0)) return null;

    const nonUsdEntries = Object.entries(r.currencyAmounts).filter(([, v]) => {
      const n = parseAmount(v);
      return !isNaN(n) && n !== 0;
    });

    if (nonUsdEntries.length !== 1) return null;

    const [code, value] = nonUsdEntries[0];
    if (commonCode === null) commonCode = code;
    else if (commonCode !== code) return null;

    totalNonUsd += parseAmount(value);
  }

  return commonCode ? { code: commonCode, amount: totalNonUsd } : null;
}

/** MTD card stats. */
export function getMtdStats(
  records: ExpenseRecord[],
  todayStr: string,
  toIso: IsoNormalizer,
): PeriodStats {
  const [year, month, day] = todayStr.split("-").map(Number);
  const monthPad = String(month).padStart(2, "0");
  const dayPad = String(day).padStart(2, "0");
  const monthStart = `${year}-${monthPad}-01`;
  const monthLabel = new Date(year, month - 1, 1).toLocaleString("en", { month: "short" });

  const current = filterPeriod(records, monthStart, todayStr, toIso);
  const usdTotal = sumUsd(current);

  const priorYear = year - 1;
  const priorStart = `${priorYear}-${monthPad}-01`;
  const priorEnd = `${priorYear}-${monthPad}-${dayPad}`;
  const prior = filterPeriod(records, priorStart, priorEnd, toIso);

  return {
    count: current.length,
    usdTotal,
    deviation: buildDeviation(usdTotal, sumUsd(prior), prior.length, `${monthLabel} '${String(priorYear).slice(2)}`),
  };
}

/** YTD card stats. */
export function getYtdStats(
  records: ExpenseRecord[],
  todayStr: string,
  toIso: IsoNormalizer,
): PeriodStats {
  const [year, month, day] = todayStr.split("-").map(Number);
  const monthPad = String(month).padStart(2, "0");
  const dayPad = String(day).padStart(2, "0");
  const yearStart = `${year}-01-01`;

  const current = filterPeriod(records, yearStart, todayStr, toIso);
  const usdTotal = sumUsd(current);

  const priorYear = year - 1;
  const priorStart = `${priorYear}-01-01`;
  const priorEnd = `${priorYear}-${monthPad}-${dayPad}`;
  const prior = filterPeriod(records, priorStart, priorEnd, toIso);

  return {
    count: current.length,
    usdTotal,
    deviation: buildDeviation(usdTotal, sumUsd(prior), prior.length, String(priorYear)),
  };
}

/** Rolling 12-month card stats. Window: [same calendar date 1 year ago, yesterday]. */
export function getRolling12mStats(
  records: ExpenseRecord[],
  todayStr: string,
  toIso: IsoNormalizer,
): PeriodStats {
  const [year, month, day] = todayStr.split("-").map(Number);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // windowEnd = yesterday; new Date handles Jan 1 → Dec 31 rollover via day − 1 = 0
  const windowEnd = fmt(new Date(year, month - 1, day - 1));
  // windowStart = same calendar date one year back
  const windowStart = fmt(new Date(year - 1, month - 1, day));
  // priorEnd = one day before windowStart
  const priorEnd = fmt(new Date(year - 1, month - 1, day - 1));
  // priorStart = same calendar date two years back
  const priorStart = fmt(new Date(year - 2, month - 1, day));

  const current = filterPeriod(records, windowStart, windowEnd, toIso);
  const usdTotal = sumUsd(current);
  const prior = filterPeriod(records, priorStart, priorEnd, toIso);

  return {
    count: current.length,
    usdTotal,
    deviation: buildDeviation(usdTotal, sumUsd(prior), prior.length, "prior 12M"),
  };
}

/**
 * Per-day USD totals for the current month.
 * Array length = days in month. Future days are NaN; past/today are actual totals (0 if no records).
 */
export function getMtdDailyAmounts(
  records: ExpenseRecord[],
  todayStr: string,
  toIso: IsoNormalizer,
): number[] {
  const [year, month, day] = todayStr.split("-").map(Number);
  const totalDays = daysInMonth(year, month);

  const amounts = new Array<number>(totalDays).fill(NaN);
  for (let d = 1; d <= day; d++) amounts[d - 1] = 0;

  for (const r of records) {
    const iso = toIso(r.Date);
    if (!iso) continue;
    const [ry, rm, rd] = iso.split("-").map(Number);
    if (ry !== year || rm !== month || rd > day) continue;
    amounts[rd - 1] += parseUsd(r);
  }

  return amounts;
}

/**
 * 0-indexed positions of Mondays within the month (used for week-boundary lines in the chart).
 * A line is drawn to the LEFT of each Monday (i.e. between Sunday and Monday).
 */
export function getMtdWeekBoundaryPositions(year: number, month: number): number[] {
  const totalDays = daysInMonth(year, month);
  const positions: number[] = [];
  for (let d = 2; d <= totalDays; d++) {
    if (new Date(year, month - 1, d).getDay() === 1) {
      positions.push(d - 1); // 0-indexed position of this Monday
    }
  }
  return positions;
}

function filterPeriod(
  records: ExpenseRecord[],
  start: string,
  end: string,
  toIso: IsoNormalizer,
): ExpenseRecord[] {
  return records.filter((r) => {
    const iso = toIso(r.Date);
    return iso !== null && iso >= start && iso <= end;
  });
}

function sumUsd(records: ExpenseRecord[]): number {
  return records.reduce((sum, r) => sum + parseUsd(r), 0);
}

function buildDeviation(
  current: number,
  prior: number,
  priorCount: number,
  priorLabel: string,
): PeriodStats["deviation"] {
  if (priorCount === 0) return null;
  const absChange = current - prior;
  const pctChange = prior !== 0 ? Math.round(Math.abs(absChange / prior) * 100) : 0;
  return { up: absChange >= 0, pctChange, absChange: Math.abs(absChange), priorLabel };
}
