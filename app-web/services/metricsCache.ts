import { type TodayStats, type PeriodStats, type YtdForecast } from "../utils/dashboardStats";
import { readJsonStorage, writeJsonStorage } from "../utils/storage";

const CURRENT_SCHEMA_VERSION = 9;
const MAX_DAYS_IN_MONTH = 31;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SAFE_LABEL_RE = /^[A-Za-z0-9 ':-]+$/;
const SPREADSHEET_ID_RE = /^[A-Za-z0-9_-]+$/;

export interface MetricsCacheEntry {
  schemaVersion?: number;
  cacheDate: string;
  spreadsheetId: string;
  sheetLastModifiedTime: string | null;
  todayStats: TodayStats;
  mtdStats: PeriodStats;
  ytdStats: PeriodStats;
  ytdForecast: YtdForecast;
  rolling12mStats: PeriodStats;
  mtdDailyAmounts: (number | null)[];
  weekBoundaryPositions: number[];
}

function cacheKey(email: string): string {
  return `qe_metrics_${email.toLowerCase()}`;
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const objectValue = value as Record<string, unknown>;
  if (
    Object.hasOwn(objectValue, "__proto__") ||
    Object.hasOwn(objectValue, "constructor") ||
    Object.hasOwn(objectValue, "prototype")
  ) {
    return null;
  }
  return objectValue;
}

function sanitizeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeNonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function sanitizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const normalized = date.toISOString().slice(0, 10);
  return normalized === value ? value : null;
}

function sanitizeIsoDateTime(value: unknown): string | null {
  if (typeof value !== "string" || !ISO_DATETIME_RE.test(value)) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? value : null;
}

function sanitizeSafeLabel(value: unknown, maxLength = 24): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return SAFE_LABEL_RE.test(trimmed) ? trimmed : null;
}

function sanitizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function sanitizeSpreadsheetId(value: unknown): string | null {
  return typeof value === "string" && SPREADSHEET_ID_RE.test(value) ? value : null;
}

function sanitizeDeviation(value: unknown): PeriodStats["deviation"] {
  if (value === null) return null;
  const obj = asPlainObject(value);
  if (!obj || typeof obj.up !== "boolean") return null;

  const pctChange = sanitizeFiniteNumber(obj.pctChange);
  const absChange = sanitizeFiniteNumber(obj.absChange);
  const priorTotal = sanitizeFiniteNumber(obj.priorTotal);
  const priorLabel = sanitizeSafeLabel(obj.priorLabel);
  if (pctChange === null || absChange === null || priorTotal === null || priorLabel === null) return null;

  return {
    up: obj.up,
    pctChange,
    absChange,
    priorLabel,
    priorTotal,
  };
}

function sanitizeTodayStats(value: unknown): TodayStats | null {
  const obj = asPlainObject(value);
  if (!obj) return null;

  const count = sanitizeNonNegativeInt(obj.count);
  const usdTotal = sanitizeFiniteNumber(obj.usdTotal);
  if (count === null || usdTotal === null) return null;

  if (obj.dualCurrency === null) {
    return { count, usdTotal, dualCurrency: null };
  }

  const dual = asPlainObject(obj.dualCurrency);
  if (!dual) return null;
  const code = sanitizeCurrencyCode(dual.code);
  const amount = sanitizeFiniteNumber(dual.amount);
  if (code === null || amount === null) return null;

  return {
    count,
    usdTotal,
    dualCurrency: { code, amount },
  };
}

function sanitizePeriodStats(value: unknown): PeriodStats | null {
  const obj = asPlainObject(value);
  if (!obj) return null;
  const count = sanitizeNonNegativeInt(obj.count);
  const usdTotal = sanitizeFiniteNumber(obj.usdTotal);
  if (count === null || usdTotal === null) return null;

  return {
    count,
    usdTotal,
    deviation: sanitizeDeviation(obj.deviation),
  };
}

function sanitizeYtdForecast(value: unknown): YtdForecast | null {
  const obj = asPlainObject(value);
  if (!obj) return null;

  const amountUsd = obj.amountUsd === null ? null : sanitizeFiniteNumber(obj.amountUsd);
  if (obj.amountUsd !== null && amountUsd === null) return null;

  return {
    amountUsd,
    deviation: sanitizeDeviation(obj.deviation),
  };
}

function sanitizeMtdDailyAmounts(value: unknown): (number | null)[] | null {
  if (!Array.isArray(value) || value.length > MAX_DAYS_IN_MONTH) return null;
  const amounts: (number | null)[] = [];
  for (const item of value) {
    if (item === null) {
      amounts.push(null);
      continue;
    }
    const numeric = sanitizeFiniteNumber(item);
    if (numeric === null) return null;
    amounts.push(numeric);
  }
  return amounts;
}

function sanitizeWeekBoundaryPositions(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_DAYS_IN_MONTH) return null;
  const positions: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item >= MAX_DAYS_IN_MONTH) return null;
    positions.push(item);
  }
  return positions;
}

function sanitizeMetricsCacheEntry(value: unknown, requireStoredSchemaVersion: boolean): MetricsCacheEntry | null {
  const obj = asPlainObject(value);
  if (!obj) return null;

  if (requireStoredSchemaVersion && obj.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;

  const cacheDate = sanitizeIsoDate(obj.cacheDate);
  const spreadsheetId = sanitizeSpreadsheetId(obj.spreadsheetId);
  const sheetLastModifiedTime = obj.sheetLastModifiedTime === null ? null : sanitizeIsoDateTime(obj.sheetLastModifiedTime);
  const todayStats = sanitizeTodayStats(obj.todayStats);
  const mtdStats = sanitizePeriodStats(obj.mtdStats);
  const ytdStats = sanitizePeriodStats(obj.ytdStats);
  const ytdForecast = sanitizeYtdForecast(obj.ytdForecast);
  const rolling12mStats = sanitizePeriodStats(obj.rolling12mStats);
  const mtdDailyAmounts = sanitizeMtdDailyAmounts(obj.mtdDailyAmounts);
  const weekBoundaryPositions = sanitizeWeekBoundaryPositions(obj.weekBoundaryPositions);
  if (
    cacheDate === null ||
    spreadsheetId === null ||
    sheetLastModifiedTime === null ||
    todayStats === null ||
    mtdStats === null ||
    ytdStats === null ||
    ytdForecast === null ||
    rolling12mStats === null ||
    mtdDailyAmounts === null ||
    weekBoundaryPositions === null
  ) {
    return null;
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    cacheDate,
    spreadsheetId,
    sheetLastModifiedTime,
    todayStats,
    mtdStats,
    ytdStats,
    ytdForecast,
    rolling12mStats,
    mtdDailyAmounts,
    weekBoundaryPositions,
  };
}

export const metricsCache = {
  // spreadsheetId must match the currently linked sheet — prevents showing stale totals
  // from a previously linked sheet after the user relinks a different one.
  // Entries from earlier days are still returned: callers render them as stale while refreshing.
  load(email: string, spreadsheetId: string): MetricsCacheEntry | null {
    const key = cacheKey(email);
    const entry = readJsonStorage<unknown>(localStorage, key);
    const sanitized = sanitizeMetricsCacheEntry(entry, true);

    if (!sanitized || sanitized.spreadsheetId !== spreadsheetId) {
      localStorage.removeItem(key);
      return null;
    }

    return sanitized;
  },

  save(email: string, entry: MetricsCacheEntry): void {
    const key = cacheKey(email);
    const sanitized = sanitizeMetricsCacheEntry(entry, false);
    if (!sanitized) {
      localStorage.removeItem(key);
      return;
    }
    writeJsonStorage(localStorage, key, sanitized);
  },

  clear(email: string): void {
    localStorage.removeItem(cacheKey(email));
  },
};
