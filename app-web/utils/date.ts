export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayLocalDate(): string {
  return formatLocalDate(new Date());
}

export interface DateShortcutRange {
  dateFrom: string;
  dateTo: string;
}

export function getDateShortcutRanges(refDate: Date = new Date()): {
  last7d: DateShortcutRange;
  last30d: DateShortcutRange;
  lastWeek: DateShortcutRange;
  lastMonth: DateShortcutRange;
} {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const day = refDate.getDate();

  // Last 7 days (-7 days from refDate)
  const d7 = new Date(year, month, day - 7);
  const last7d: DateShortcutRange = {
    dateFrom: formatLocalDate(d7),
    dateTo: "",
  };

  // Last 30 days (-30 days from refDate)
  const d30 = new Date(year, month, day - 30);
  const last30d: DateShortcutRange = {
    dateFrom: formatLocalDate(d30),
    dateTo: "",
  };

  // Last week (Monday to Sunday of previous calendar week)
  const dayOfWeek = refDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const currentWeekMon = new Date(year, month, day - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const lastWeekMon = new Date(currentWeekMon.getFullYear(), currentWeekMon.getMonth(), currentWeekMon.getDate() - 7);
  const lastWeekSun = new Date(currentWeekMon.getFullYear(), currentWeekMon.getMonth(), currentWeekMon.getDate() - 1);
  const lastWeek: DateShortcutRange = {
    dateFrom: formatLocalDate(lastWeekMon),
    dateTo: formatLocalDate(lastWeekSun),
  };

  // Last month (1st to last day of previous calendar month)
  const lastMonthFirst = new Date(year, month - 1, 1);
  const lastMonthLast = new Date(year, month, 0);
  const lastMonth: DateShortcutRange = {
    dateFrom: formatLocalDate(lastMonthFirst),
    dateTo: formatLocalDate(lastMonthLast),
  };

  return { last7d, last30d, lastWeek, lastMonth };
}

export function isValidIsoDate(dateValue: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function normalizeDateToIso(dateValue: string): string {
  if (!dateValue) return dateValue;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;

  const parts = dateValue.split(/[/-]/);
  if (parts.length !== 3) return dateValue;

  const [first, second, third] = parts;
  const firstNum = Number.parseInt(first, 10);
  const secondNum = Number.parseInt(second, 10);
  const thirdNum = Number.parseInt(third, 10);
  if (![firstNum, secondNum, thirdNum].every((num) => Number.isFinite(num))) return dateValue;

  if (third.length === 4) {
    if (firstNum > 12 && secondNum <= 12) return `${third}-${String(secondNum).padStart(2, "0")}-${String(firstNum).padStart(2, "0")}`;
    if (secondNum > 12 && firstNum <= 12) return `${third}-${String(firstNum).padStart(2, "0")}-${String(secondNum).padStart(2, "0")}`;
    return `${third}-${String(firstNum).padStart(2, "0")}-${String(secondNum).padStart(2, "0")}`;
  }

  if (first.length === 4) {
    return `${first}-${String(secondNum).padStart(2, "0")}-${String(thirdNum).padStart(2, "0")}`;
  }

  return dateValue;
}

/**
 * Infers a date formatter from a list of date strings sampled from the sheet.
 * Detects separator (/ - .), year position (first or last), and day/month order
 * (resolved by finding a non-year segment with value > 12 across samples).
 * Returns null when the format cannot be determined — callers should fall back to ISO.
 */
export function detectDateFormat(samples: string[]): { toSheet: (date: Date) => string; toIso: (dateStr: string) => string | null } | null {
  let sep: string | null = null;
  let yearFirst: boolean | null = null;
  let dayFirst: boolean | null = null;
  let zeroPadded: boolean | null = null;

  for (const sample of samples) {
    if (!sample) continue;
    const foundSep = ["/", "-", "."].find((s) => sample.split(s).length === 3);
    if (!foundSep) continue;
    const parts = sample.split(foundSep);
    if (parts.some((p) => !/^\d+$/.test(p))) continue;
    const yIdx = parts.findIndex((p) => p.length === 4 && Number.parseInt(p, 10) > 1000);
    if (yIdx === -1) continue;

    if (sep === null) {
      sep = foundSep;
      yearFirst = yIdx === 0;
    } else if (foundSep !== sep) {
      continue; // inconsistent separator — skip this sample
    }

    if (dayFirst === null) {
      const [ai, bi] = [0, 1, 2].filter((i) => i !== yIdx);
      const a = Number.parseInt(parts[ai], 10);
      const b = Number.parseInt(parts[bi], 10);
      if (a > 12) dayFirst = true;
      else if (b > 12) dayFirst = false;
    }

    // Detect zero-padding from a non-year segment whose value is unambiguously < 10
    if (zeroPadded === null) {
      for (const i of [0, 1, 2]) {
        if (i === yIdx) continue;
        const v = Number.parseInt(parts[i], 10);
        if (v < 10) {
          zeroPadded = parts[i].length === 2; // "06" → padded, "6" → unpadded
          break;
        }
      }
    }

    if (dayFirst !== null && zeroPadded !== null) break; // all info gathered
  }

  if (sep === null || yearFirst === null || dayFirst === null) return null;

  const s = sep;
  const yf = yearFirst;
  const df = dayFirst;
  const zp = zeroPadded ?? true; // default to padded when all samples have values ≥ 10

  const toSheet = (date: Date): string => {
    const y = String(date.getFullYear());
    const rawM = String(date.getMonth() + 1);
    const rawD = String(date.getDate());
    const m = zp ? rawM.padStart(2, "0") : rawM;
    const d = zp ? rawD.padStart(2, "0") : rawD;
    const [first, second] = df ? [d, m] : [m, d];
    return yf ? [y, first, second].join(s) : [first, second, y].join(s);
  };

  const toIso = (dateStr: string): string | null => {
    const parts = dateStr.split(s);
    if (parts.length !== 3) return null;
    const [p0, p1, p2] = parts;
    const [yearStr, firstStr, secondStr] = yf ? [p0, p1, p2] : [p2, p0, p1];
    const monthStr = df ? secondStr : firstStr;
    const dayStr = df ? firstStr : secondStr;
    if (!/^\d{4}$/.test(yearStr)) return null;
    return `${yearStr}-${monthStr.padStart(2, "0")}-${dayStr.padStart(2, "0")}`;
  };

  return { toSheet, toIso };
}
