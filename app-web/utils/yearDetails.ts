import { parseUsd } from "./currencyTotals";
import { ExpenseRecord } from "../types/expense";
import { IsoNormalizer } from "./dashboardStats";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AVG_DAYS_PER_MONTH = 365.25 / 12;

function toDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysInYear(year: number): number {
  return (new Date(year, 1, 29).getMonth() === 1) ? 366 : 365;
}

/** One USD total per calendar month (0-indexed Jan=0). Future months of the current year are `null` (forecast placeholders). */
export function getYearMonthlyAmounts(
  records: ExpenseRecord[],
  year: number,
  toIso: IsoNormalizer,
  today: string,
): (number | null)[] {
  const isCurrentYear = year === Number(today.slice(0, 4));
  const currentMonthIndex = Number(today.slice(5, 7)) - 1;

  const amounts: (number | null)[] = new Array(12).fill(0).map((_, index) =>
    isCurrentYear && index > currentMonthIndex ? null : 0,
  );

  for (const r of records) {
    const iso = toIso(r.Date);
    if (!iso) continue;
    const [ry, rm] = iso.split("-").map(Number);
    if (ry !== year) continue;
    const monthIndex = rm - 1;
    if (amounts[monthIndex] === null) continue;
    amounts[monthIndex] = (amounts[monthIndex] as number) + parseUsd(r);
  }

  return amounts;
}

/** Full calendar year, or Jan 1 – today for the current (in-progress) year. */
export function getYearRange(year: number, today: string): { startDate: string; endDate: string } {
  const isCurrentYear = year === Number(today.slice(0, 4));
  return { startDate: `${year}-01-01`, endDate: isCurrentYear ? today : `${year}-12-31` };
}

/** Shifts both dates back one calendar year, clamping Feb 29 to Feb 28 when the prior year isn't a leap year. */
export function computePriorYearRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  const shiftBackOneYear = (iso: string): string => {
    const [y, m, d] = iso.split("-").map(Number);
    const prevYear = y - 1;
    const clampedDay = m === 2 && d === 29 && daysInYear(prevYear) === 365 ? 28 : d;
    return `${prevYear}-${String(m).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
  };
  return { startDate: shiftBackOneYear(startDate), endDate: shiftBackOneYear(endDate) };
}

/**
 * Average USD spend per month for the selected year.
 * Current year: year-to-date total ÷ elapsed months, prorated by day-of-year (fractional).
 * Past year: full-year total ÷ (days between earliest and latest expense) / (365.25/12), floored at 1 month.
 */
export function getYearlyAverageSpend(
  records: ExpenseRecord[],
  year: number,
  toIso: IsoNormalizer,
  today: string,
): number | null {
  const yearIsoDates = records
    .map((r) => toIso(r.Date))
    .filter((iso): iso is string => iso !== null && iso.slice(0, 4) === String(year));
  if (yearIsoDates.length === 0) return null;

  const yearTotal = records.reduce((sum, r) => {
    const iso = toIso(r.Date);
    return iso && iso.slice(0, 4) === String(year) ? sum + parseUsd(r) : sum;
  }, 0);

  const isCurrentYear = year === Number(today.slice(0, 4));
  if (isCurrentYear) {
    const dayOfYear = Math.round((toDateLocal(today).getTime() - new Date(year, 0, 1).getTime()) / MS_PER_DAY) + 1;
    const elapsedMonths = (dayOfYear / daysInYear(year)) * 12;
    return yearTotal / elapsedMonths;
  }

  const earliestIso = yearIsoDates.reduce((min, iso) => (iso < min ? iso : min));
  const latestIso = yearIsoDates.reduce((max, iso) => (iso > max ? iso : max));
  const spanDays = Math.round((toDateLocal(latestIso).getTime() - toDateLocal(earliestIso).getTime()) / MS_PER_DAY);
  const months = Math.max(1, spanDays / AVG_DAYS_PER_MONTH);
  return yearTotal / months;
}
