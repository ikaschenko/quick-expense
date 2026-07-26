import { detectDateFormat } from "./date";
import { computeDualCurrency, parseUsd, DualCurrency } from "./currencyTotals";
import { ExpenseRecord } from "../types/expense";

export type IsoNormalizer = (raw: string) => string | null;

export interface TodayStats {
  count: number;
  usdTotal: number;
  dualCurrency: DualCurrency | null;
}

export interface PeriodStats {
  count: number;
  usdTotal: number;
  deviation: {
    up: boolean;
    pctChange: number;
    absChange: number;
    priorLabel: string;
    priorTotal: number;
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

/** MTD card stats. */
export function getMtdStats(
  records: ExpenseRecord[],
  todayStr: string,
  toIso: IsoNormalizer,
): PeriodStats {
  const [year, month, day] = todayStr.split("-").map(Number);
  const monthPad = String(month).padStart(2, "0");
  const monthStart = `${year}-${monthPad}-01`;

  const current = filterPeriod(records, monthStart, todayStr, toIso);
  const usdTotal = sumUsd(current);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonthPad = String(prevMonth).padStart(2, "0");
  const clampedDay = Math.min(day, daysInMonth(prevYear, prevMonth));
  const priorStart = `${prevYear}-${prevMonthPad}-01`;
  const priorEnd = `${prevYear}-${prevMonthPad}-${String(clampedDay).padStart(2, "0")}`;
  const prevMonthLabel = new Date(prevYear, prevMonth - 1, 1).toLocaleString("en", { month: "short" });
  const prior = filterPeriod(records, priorStart, priorEnd, toIso);

  return {
    count: current.length,
    usdTotal,
    deviation: buildDeviation(usdTotal, sumUsd(prior), prior.length, `${prevMonthLabel} '${String(prevYear).slice(2)}`),
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

export interface YtdForecast {
  amountUsd: number | null;
  deviation: PeriodStats["deviation"];
}

/**
 * Full-year USD spend forecast for the YTD card. Projects the daily run-rate of a
 * recent baseline window through Dec 31 of the current year.
 *
 * Baseline window resolution (first matching rule wins):
 *  - Late-starter: if the earliest YTD record is after Jan 1, start there (takes
 *    precedence over early-Jan smoothing).
 *  - Early-Jan smoothing: if today is before Jan 15, use a trailing 15-day window
 *    (may cross into the prior year) instead of the too-short Jan 1 → yesterday window.
 *  - Default: Jan 1 → yesterday.
 *
 * Returns `amountUsd: null` ("not enough data") when the baseline window contains
 * fewer than 3 distinct calendar days with at least one recorded expense.
 *
 * `deviation` compares the forecast to the prior full calendar year's actual USD
 * total (null when the forecast itself is null, or when the prior year has no data).
 */
export function getYtdForecast(
  records: ExpenseRecord[],
  todayStr: string,
  toIso: IsoNormalizer,
): YtdForecast {
  const [year, month, day] = todayStr.split("-").map(Number);
  const yearStart = `${year}-01-01`;

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const windowEndDate = new Date(year, month - 1, day - 1); // yesterday
  const windowEnd = fmt(windowEndDate);

  const yearToDateIsoDates = filterPeriod(records, yearStart, todayStr, toIso)
    .map((r) => toIso(r.Date))
    .filter((iso): iso is string => iso !== null);
  const earliestIso = yearToDateIsoDates.length > 0
    ? yearToDateIsoDates.reduce((min, iso) => (iso < min ? iso : min))
    : null;

  let baselineStart: string;
  let baselineStartDate: Date;
  if (earliestIso !== null && earliestIso > yearStart) {
    // Late-starter override — takes precedence over early-Jan smoothing.
    baselineStart = earliestIso;
    const [sy, sm, sd] = earliestIso.split("-").map(Number);
    baselineStartDate = new Date(sy, sm - 1, sd);
  } else if (month === 1 && day < 15) {
    // Early-January smoothing — extend to a trailing 15-day window.
    baselineStartDate = new Date(year, month - 1, day - 15);
    baselineStart = fmt(baselineStartDate);
  } else {
    baselineStart = yearStart;
    baselineStartDate = new Date(year, 0, 1);
  }

  const baselineRecords = filterPeriod(records, baselineStart, windowEnd, toIso);
  const distinctDays = new Set(
    baselineRecords.map((r) => toIso(r.Date)).filter((iso): iso is string => iso !== null),
  ).size;
  if (distinctDays < 3) return { amountUsd: null, deviation: null };

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysInBaselineWindow = Math.round((windowEndDate.getTime() - baselineStartDate.getTime()) / msPerDay) + 1;
  const yearEndDate = new Date(year, 11, 31);
  const totalDaysInProjectionPeriod = Math.round((yearEndDate.getTime() - baselineStartDate.getTime()) / msPerDay) + 1;

  const baselineTotalUsd = sumUsd(baselineRecords);
  const amountUsd = (baselineTotalUsd * totalDaysInProjectionPeriod) / daysInBaselineWindow;

  const priorYear = year - 1;
  const priorYearRecords = filterPeriod(records, `${priorYear}-01-01`, `${priorYear}-12-31`, toIso);
  const deviation = buildDeviation(amountUsd, sumUsd(priorYearRecords), priorYearRecords.length, String(priorYear));

  return { amountUsd, deviation };
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
 * Array length = days in month. Future days are null; past/today are actual totals (0 if no records).
 */
export function getMtdDailyAmounts(
  records: ExpenseRecord[],
  todayStr: string,
  toIso: IsoNormalizer,
): (number | null)[] {
  const [year, month, day] = todayStr.split("-").map(Number);
  const totalDays = daysInMonth(year, month);

  const amounts = new Array<number | null>(totalDays).fill(null);
  for (let d = 1; d <= day; d++) amounts[d - 1] = 0;

  for (const r of records) {
    const iso = toIso(r.Date);
    if (!iso) continue;
    const [ry, rm, rd] = iso.split("-").map(Number);
    if (ry !== year || rm !== month || rd > day) continue;
    amounts[rd - 1] = (amounts[rd - 1] ?? 0) + parseUsd(r);
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
  return { up: absChange >= 0, pctChange, absChange: Math.abs(absChange), priorLabel, priorTotal: prior };
}
