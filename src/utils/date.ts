export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayLocalDate(): string {
  return formatLocalDate(new Date());
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
    const yIdx = parts.findIndex((p) => p.length === 4 && parseInt(p, 10) > 1000);
    if (yIdx === -1) continue;

    if (sep === null) {
      sep = foundSep;
      yearFirst = yIdx === 0;
    } else if (foundSep !== sep) {
      continue; // inconsistent separator — skip this sample
    }

    if (dayFirst === null) {
      const [ai, bi] = [0, 1, 2].filter((i) => i !== yIdx);
      const a = parseInt(parts[ai], 10);
      const b = parseInt(parts[bi], 10);
      if (a > 12) dayFirst = true;
      else if (b > 12) dayFirst = false;
    }

    // Detect zero-padding from a non-year segment whose value is unambiguously < 10
    if (zeroPadded === null) {
      for (const i of [0, 1, 2]) {
        if (i === yIdx) continue;
        const v = parseInt(parts[i], 10);
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
