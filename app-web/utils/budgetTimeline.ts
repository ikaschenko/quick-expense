import { BUDGET_MAX_PROJECTION_DAYS, BUDGET_MIN_SPEND_DAYS, BUDGET_RECENT_PACE_DAYS, BUDGET_WEEKLY_THRESHOLD_DAYS } from "../constants/expenses";
import { ExpenseRecord } from "../types/expense";
import { parseUsd } from "./currencyTotals";
import { isValidIsoDate, normalizeDateToIso } from "./date";
import { readJsonStorage, writeJsonStorage } from "./storage";

export interface BudgetSettings {
  budgetUsd: number | null;
  endDate: string | null;
}

export interface PaceProjection {
  pace: "overall" | "recent";
  rateUsd: number;
  projectedAtEndUsd: number | null;
  runOutDate: string | null;
}

export type BudgetVerdict =
  | { kind: "actualOnly" }
  | { kind: "notEnoughData" }
  | { kind: "finished"; totalUsd: number; budgetUsd: number | null }
  | { kind: "overBudget"; overUsd: number; sinceDate: string }
  | { kind: "projection"; budgetUsd: number | null; endDate: string | null; horizonDate: string; paces: PaceProjection[] };

export interface BudgetTimelinePoint {
  /** Last day of the point's period (the day itself, or the end of the week). */
  date: string;
  periodUsd: number | null;
  actualCum: number | null;
  projectedOverall: number | null;
  projectedRecent: number | null;
}

export interface BudgetTimeline {
  startDate: string;
  granularity: "day" | "week";
  points: BudgetTimelinePoint[];
  totalUsd: number;
  verdict: BudgetVerdict;
  endDateBeforeStart: boolean;
}

export interface BudgetTimelineInput {
  records: ExpenseRecord[];
  todayIso: string;
  dateFrom: string;
  budgetUsd: number | null;
  endDate: string | null;
}

const BUDGET_STORAGE_PREFIX = "qe_budget_";
const MS_PER_DAY = 86_400_000;

function budgetStorageKey(email: string): string {
  return `${BUDGET_STORAGE_PREFIX}${email.toLowerCase()}`;
}

export function readBudgetSettings(storage: Storage, email: string): BudgetSettings {
  const key = budgetStorageKey(email);
  const hasStoredValue = storage.getItem(key) !== null;
  const raw = readJsonStorage<Partial<BudgetSettings>>(storage, key);
  const budgetUsd = raw?.budgetUsd;
  const endDate = raw?.endDate;
  const settings = {
    budgetUsd: typeof budgetUsd === "number" && Number.isFinite(budgetUsd) && budgetUsd > 0 ? budgetUsd : null,
    endDate: typeof endDate === "string" && isValidIsoDate(endDate) ? endDate : null,
  };
  if (hasStoredValue && settings.budgetUsd === null && settings.endDate === null) storage.removeItem(key);
  else if (raw !== null && (settings.budgetUsd !== budgetUsd || settings.endDate !== endDate)) writeJsonStorage(storage, key, settings);
  return settings;
}

export function writeBudgetSettings(storage: Storage, email: string, settings: BudgetSettings): void {
  const key = budgetStorageKey(email);
  if (settings.budgetUsd === null && settings.endDate === null) {
    storage.removeItem(key);
    return;
  }
  writeJsonStorage(storage, key, settings);
}

// UTC arithmetic keeps day counts exact across DST changes.
function toUtc(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function diffDays(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function isSunday(iso: string): boolean {
  return new Date(toUtc(iso)).getUTCDay() === 0;
}

function laterOf(a: string, b: string): string {
  return b > a ? b : a;
}

function earlierOf(a: string, b: string): string {
  return b < a ? b : a;
}

/**
 * Cumulative USD burn-up for the given (already filtered) records, projected at overall and
 * recent daily rates. Returns null when no record has a valid date.
 */
export function buildBudgetTimeline({ records, todayIso, dateFrom, budgetUsd, endDate: rawEndDate }: BudgetTimelineInput): BudgetTimeline | null {
  const daily = new Map<string, number>();
  for (const record of records) {
    const iso = normalizeDateToIso(record.Date);
    if (!isValidIsoDate(iso)) continue;
    daily.set(iso, (daily.get(iso) ?? 0) + parseUsd(record));
  }
  if (daily.size === 0) return null;

  const dates = [...daily.keys()].sort();
  const startDate = isValidIsoDate(dateFrom) ? dateFrom : dates[0];
  const lastDate = dates[dates.length - 1];
  const endDateBeforeStart = rawEndDate !== null && rawEndDate < startDate;
  const endDate = endDateBeforeStart ? null : rawEndDate;
  const finished = endDate !== null && endDate < todayIso;
  const actualEnd = finished ? laterOf(lastDate, endDate) : laterOf(todayIso, lastDate);

  let totalUsd = 0;
  let spentToDate = 0;
  let spendDaysToDate = 0;
  let recentSpent = 0;
  let overSince: string | null = null;
  for (const date of dates) {
    totalUsd += daily.get(date) ?? 0;
    if (date <= todayIso) {
      spentToDate += daily.get(date) ?? 0;
      spendDaysToDate++;
    }
    if (date >= addDays(todayIso, -(BUDGET_RECENT_PACE_DAYS - 1)) && date <= todayIso) {
      recentSpent += daily.get(date) ?? 0;
    }
    if (overSince === null && budgetUsd !== null && totalUsd > budgetUsd) overSince = date;
  }
  if (budgetUsd !== null && totalUsd <= budgetUsd) overSince = null;

  const elapsedDays = diffDays(startDate, todayIso) + 1;
  const canProject = !finished && elapsedDays > 0 && spendDaysToDate >= BUDGET_MIN_SPEND_DAYS;
  const rates = canProject
    ? [
        { pace: "overall" as const, rateUsd: spentToDate / elapsedDays },
        ...(elapsedDays >= BUDGET_RECENT_PACE_DAYS
          ? [{ pace: "recent" as const, rateUsd: recentSpent / BUDGET_RECENT_PACE_DAYS }]
          : []),
      ]
    : [];
  const horizonDate = addDays(actualEnd, BUDGET_MAX_PROJECTION_DAYS);
  const paces: PaceProjection[] = rates.map(({ pace, rateUsd }) => ({
    pace,
    rateUsd,
    projectedAtEndUsd: endDate === null ? null : totalUsd + rateUsd * diffDays(actualEnd, laterOf(endDate, actualEnd)),
    runOutDate: budgetUsd !== null && overSince === null && rateUsd > 0
      ? addDays(actualEnd, Math.max(Math.ceil((budgetUsd - totalUsd) / rateUsd), 0))
      : null,
  }));

  let verdict: BudgetVerdict;
  if (budgetUsd === null && endDate === null) {
    verdict = { kind: "actualOnly" };
  } else if (finished) {
    verdict = { kind: "finished", totalUsd, budgetUsd };
  } else if (budgetUsd !== null && overSince !== null) {
    verdict = { kind: "overBudget", overUsd: totalUsd - budgetUsd, sinceDate: overSince };
  } else if (!canProject) {
    verdict = { kind: "notEnoughData" };
  } else {
    verdict = { kind: "projection", budgetUsd, endDate, horizonDate, paces };
  }

  let projectionEnd = actualEnd;
  if (canProject && endDate !== null) projectionEnd = laterOf(endDate, actualEnd);
  else if (canProject && budgetUsd !== null) {
    const lastRunOut = paces.reduce<string | null>(
      (latest, pace) => pace.runOutDate !== null && (latest === null || pace.runOutDate > latest) ? pace.runOutDate : latest,
      null,
    );
    if (lastRunOut !== null) projectionEnd = lastRunOut;
  }
  const axisEnd = earlierOf(projectionEnd, addDays(actualEnd, BUDGET_MAX_PROJECTION_DAYS));
  const isProjecting = axisEnd > actualEnd;

  const span = diffDays(startDate, axisEnd) + 1;
  const granularity = span > BUDGET_WEEKLY_THRESHOLD_DAYS ? "week" : "day";
  const points: BudgetTimelinePoint[] = [];
  let running = 0;
  let periodUsd = 0;
  let bucketStart = startDate;
  for (let i = 0; i < span; i++) {
    const date = addDays(startDate, i);
    if (date <= actualEnd) {
      const amount = daily.get(date) ?? 0;
      running += amount;
      periodUsd += amount;
    }
    if (granularity === "week" && i < span - 1 && !isSunday(date)) continue;

    const hasActual = bucketStart <= actualEnd;
    let projectedOverall: number | null = null;
    let projectedRecent: number | null = null;
    if (isProjecting && date >= actualEnd) {
      const offsetDays = diffDays(actualEnd, date);
      projectedOverall = totalUsd + (rates.find((pace) => pace.pace === "overall")?.rateUsd ?? 0) * offsetDays;
      const recentRate = rates.find((pace) => pace.pace === "recent")?.rateUsd;
      projectedRecent = recentRate === undefined ? null : totalUsd + recentRate * offsetDays;
      if (hasActual) {
        projectedOverall = totalUsd;
        if (recentRate !== undefined) projectedRecent = totalUsd;
      }
    }
    points.push({
      date,
      periodUsd: hasActual ? periodUsd : null,
      actualCum: hasActual ? running : null,
      projectedOverall,
      projectedRecent,
    });
    periodUsd = 0;
    bucketStart = addDays(date, 1);
  }

  return { startDate, granularity, points, totalUsd, verdict, endDateBeforeStart };
}
