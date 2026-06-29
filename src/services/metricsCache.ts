import { type TodayStats, type PeriodStats } from "../utils/dashboardStats";
import { readJsonStorage, writeJsonStorage } from "../utils/storage";
import { getTodayLocalDate } from "../utils/date";

const CURRENT_SCHEMA_VERSION = 3;

export interface MetricsCacheEntry {
  schemaVersion?: number;
  cacheDate: string;
  sheetLastModifiedTime: string | null;
  todayStats: TodayStats;
  mtdStats: PeriodStats;
  ytdStats: PeriodStats;
  rolling12mStats: PeriodStats;
  mtdDailyAmounts: number[];
  weekBoundaryPositions: number[];
}

function cacheKey(email: string): string {
  return `qe_metrics_${email.toLowerCase()}`;
}

export const metricsCache = {
  load(email: string): MetricsCacheEntry | null {
    const entry = readJsonStorage<MetricsCacheEntry>(localStorage, cacheKey(email));
    if (!entry || entry.cacheDate !== getTodayLocalDate() || entry.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;
    return entry;
  },

  save(email: string, entry: MetricsCacheEntry): void {
    writeJsonStorage(localStorage, cacheKey(email), { ...entry, schemaVersion: CURRENT_SCHEMA_VERSION });
  },

  clear(email: string): void {
    localStorage.removeItem(cacheKey(email));
  },
};
