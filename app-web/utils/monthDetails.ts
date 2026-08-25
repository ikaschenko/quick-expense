import { parseUsd } from "./currencyTotals";
import { getCategoryColor } from "./categoryColor";
import { ExpenseRecord } from "../types/expense";
import { IsoNormalizer } from "./dashboardStats";

export interface CategoryBreakdownRow {
  label: string;
  currentAmount: number;
  priorAmount: number | null;
  /** Signed percentage change vs prior month; null when no comparable prior data. */
  deviationPct: number | null;
}

export interface PieSlice {
  label: string;
  amount: number;
  pct: number;
  color: string;
}

export const OTHER_LABEL = "Other";
const OTHER_THRESHOLD_PCT = 1;

function toDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function filterByRange(
  records: ExpenseRecord[],
  startDate: string,
  endDate: string,
  toIso: IsoNormalizer,
): ExpenseRecord[] {
  return records.filter((r) => {
    const iso = toIso(r.Date);
    return iso !== null && iso >= startDate && iso <= endDate;
  });
}

/** Total USD spend in [startDate, endDate] ÷ inclusive calendar day count. $0 days included. */
export function getAverageDailySpend(
  records: ExpenseRecord[],
  startDate: string,
  endDate: string,
  toIso: IsoNormalizer,
): number {
  const total = filterByRange(records, startDate, endDate, toIso).reduce((sum, r) => sum + parseUsd(r), 0);
  const days = Math.round((toDateLocal(endDate).getTime() - toDateLocal(startDate).getTime()) / 86400000) + 1;
  return days > 0 ? total / days : 0;
}

/** Shifts both dates back one calendar month, clamping the day-of-month to the target month's length. */
export function computePriorMonthRange(
  startDate: string,
  endDate: string,
): { startDate: string; endDate: string } {
  const shiftBackOneMonth = (iso: string): string => {
    const [y, m, d] = iso.split("-").map(Number);
    const prevMonth = m === 1 ? 12 : m - 1;
    const prevYear = m === 1 ? y - 1 : y;
    const clampedDay = Math.min(d, daysInMonth(prevYear, prevMonth));
    return `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
  };
  return { startDate: shiftBackOneMonth(startDate), endDate: shiftBackOneMonth(endDate) };
}

/** Default grouping rule: matches the first 3 characters of a category name. */
const GROUP_PREFIX_REGEX = /^.{1,3}/u;

function groupPrefixOf(name: string): string {
  return name.match(GROUP_PREFIX_REGEX)?.[0] ?? name;
}

/**
 * Category breakdown for [startDate, endDate] vs the same day-of-month range in the prior
 * calendar month. When `grouped` is true, current-period categories whose `GROUP_PREFIX_REGEX`
 * match collides with at least one other distinct current-period category are merged under
 * `{matched prefix of the first-encountered record's original casing}...`; categories with no
 * such collision keep their original name unchanged. Rows are sorted descending by
 * current-period amount.
 */
export function getCategoryBreakdown(
  records: ExpenseRecord[],
  startDate: string,
  endDate: string,
  toIso: IsoNormalizer,
  options: { grouped: boolean },
): CategoryBreakdownRow[] {
  const { grouped } = options;
  const currentRecords = filterByRange(records, startDate, endDate, toIso);
  const { startDate: priorStart, endDate: priorEnd } = computePriorMonthRange(startDate, endDate);
  const priorRecords = filterByRange(records, priorStart, priorEnd, toIso);

  // Only merge categories whose prefix is shared by 2+ distinct category names actually
  // shown in the current period — a same-prefix category from the prior period alone
  // must not trigger a merge of an otherwise-unique current-period category.
  const distinctNamesByPrefix = new Map<string, Set<string>>();
  if (grouped) {
    for (const r of currentRecords) {
      const trimmed = (r.Category ?? "").trim();
      const prefix = groupPrefixOf(trimmed).toLowerCase();
      if (!distinctNamesByPrefix.has(prefix)) distinctNamesByPrefix.set(prefix, new Set());
      distinctNamesByPrefix.get(prefix)!.add(trimmed.toLowerCase());
    }
  }

  const keyOf = (category: string): string => {
    const trimmed = category.trim();
    if (!grouped) return trimmed;
    const prefix = groupPrefixOf(trimmed).toLowerCase();
    const hasCollision = (distinctNamesByPrefix.get(prefix)?.size ?? 0) > 1;
    return hasCollision ? prefix : trimmed.toLowerCase();
  };
  const hasCollisionFor = (trimmed: string): boolean =>
    grouped && (distinctNamesByPrefix.get(groupPrefixOf(trimmed).toLowerCase())?.size ?? 0) > 1;

  const labelOf = new Map<string, string>();
  const currentTotals = new Map<string, number>();
  for (const r of currentRecords) {
    const trimmed = (r.Category ?? "").trim();
    const key = keyOf(trimmed);
    if (!labelOf.has(key)) labelOf.set(key, hasCollisionFor(trimmed) ? `${groupPrefixOf(trimmed)}...` : trimmed);
    currentTotals.set(key, (currentTotals.get(key) ?? 0) + parseUsd(r));
  }

  const priorTotals = new Map<string, number>();
  for (const r of priorRecords) {
    const key = keyOf((r.Category ?? "").trim());
    priorTotals.set(key, (priorTotals.get(key) ?? 0) + parseUsd(r));
  }

  const rows: CategoryBreakdownRow[] = [];
  for (const [key, currentAmount] of currentTotals) {
    const priorAmount = priorTotals.has(key) ? priorTotals.get(key)! : null;
    const deviationPct =
      priorAmount !== null && priorAmount !== 0
        ? Math.round(((currentAmount - priorAmount) / priorAmount) * 1000) / 10
        : null;
    rows.push({ label: labelOf.get(key)!, currentAmount, priorAmount, deviationPct });
  }

  return rows.sort((a, b) => b.currentAmount - a.currentAmount);
}

/**
 * Builds pie-chart slices from the same rows shown in the table (post Group/Top5-All filter).
 * Top 5: one slice per row, percentages relative to the sum of the shown rows only (no "Other").
 * All: rows below `OTHER_THRESHOLD_PCT`% of the rows' total are merged into a single "Other" slice.
 */
export function buildPieSlices(rows: CategoryBreakdownRow[], topFilter: "top5" | "all"): PieSlice[] {
  const total = rows.reduce((sum, r) => sum + r.currentAmount, 0);
  if (total <= 0) return [];

  if (topFilter === "top5") {
    return rows.map((r) => ({
      label: r.label,
      amount: r.currentAmount,
      pct: (r.currentAmount / total) * 100,
      color: getCategoryColor(r.label),
    }));
  }

  const slices: PieSlice[] = [];
  let otherAmount = 0;
  for (const r of rows) {
    const pct = (r.currentAmount / total) * 100;
    if (pct < OTHER_THRESHOLD_PCT) {
      otherAmount += r.currentAmount;
    } else {
      slices.push({ label: r.label, amount: r.currentAmount, pct, color: getCategoryColor(r.label) });
    }
  }
  if (otherAmount > 0) {
    slices.push({
      label: OTHER_LABEL,
      amount: otherAmount,
      pct: (otherAmount / total) * 100,
      color: getCategoryColor(OTHER_LABEL), // overridden with the fixed neutral color by the chart component
    });
  }
  return slices;
}

