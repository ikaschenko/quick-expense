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
export function detectDateFormat(samples: string[]): ((date: Date) => string) | null {
  let sep: string | null = null;
  let yearFirst: boolean | null = null;
  let dayFirst: boolean | null = null;

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

    if (dayFirst !== null) break; // all info gathered
  }

  if (sep === null || yearFirst === null || dayFirst === null) return null;

  const s = sep;
  const yf = yearFirst;
  const df = dayFirst;

  return (date: Date): string => {
    const y = String(date.getFullYear());
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const [first, second] = df ? [d, m] : [m, d];
    return yf ? [y, first, second].join(s) : [first, second, y].join(s);
  };
}
