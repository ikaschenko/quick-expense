import { describe, it, expect } from "vitest";
import { ExpenseRecord } from "../src/types/expense";
import {
  getTodayStats,
  getMtdStats,
  getYtdStats,
  getYtdForecast,
  getRolling12mStats,
  getMtdDailyAmounts,
  getMtdWeekBoundaryPositions,
  buildIsoNormalizer,
  type IsoNormalizer,
} from "../src/utils/dashboardStats";

const iso: IsoNormalizer = (s) => s; // dates already in ISO in tests

function makeRecord(date: string, usd: string, extras: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    Date: date,
    USD: usd,
    Category: "Misc",
    spentBy: "test",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 1,
    ...extras,
  };
}

const TODAY = "2026-06-09";

// ─── getTodayStats ────────────────────────────────────────────────────────────

describe("getTodayStats", () => {
  it("returns zero count and amount when no records match today", () => {
    const stats = getTodayStats([makeRecord("2026-06-08", "10")], TODAY, iso);
    expect(stats.count).toBe(0);
    expect(stats.usdTotal).toBe(0);
    expect(stats.dualCurrency).toBeNull();
  });

  it("sums USD for today's records", () => {
    const records = [makeRecord(TODAY, "10"), makeRecord(TODAY, "20"), makeRecord("2026-06-08", "5")];
    const stats = getTodayStats(records, TODAY, iso);
    expect(stats.count).toBe(2);
    expect(stats.usdTotal).toBeCloseTo(30);
  });

  it("parses USD values prefixed with $ sign (historical sheet-formatted data)", () => {
    const records = [makeRecord(TODAY, "$15.50"), makeRecord(TODAY, " $10 ")];
    const stats = getTodayStats(records, TODAY, iso);
    expect(stats.usdTotal).toBeCloseTo(25.5);
  });

  it("parses US thousands-formatted values like $2,698.19", () => {
    const records = [makeRecord(TODAY, "$2,698.19"), makeRecord(TODAY, "$1,000.00")];
    const stats = getTodayStats(records, TODAY, iso);
    expect(stats.usdTotal).toBeCloseTo(3698.19);
  });

  it("parses large US-formatted values like $10,234.56", () => {
    const records = [makeRecord(TODAY, "$10,234.56")];
    const stats = getTodayStats(records, TODAY, iso);
    expect(stats.usdTotal).toBeCloseTo(10234.56);
  });

  it("returns dualCurrency when all today records share one non-USD code and USD > 0", () => {
    const records = [
      makeRecord(TODAY, "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord(TODAY, "5", { currencyAmounts: { PLN: "20" } }),
    ];
    const stats = getTodayStats(records, TODAY, iso);
    expect(stats.dualCurrency).toEqual({ code: "PLN", amount: 60 });
  });

  it("returns null dualCurrency when records use different non-USD codes", () => {
    const records = [
      makeRecord(TODAY, "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord(TODAY, "5", { currencyAmounts: { EUR: "5" } }),
    ];
    const stats = getTodayStats(records, TODAY, iso);
    expect(stats.dualCurrency).toBeNull();
  });

  it("returns null dualCurrency when any record lacks USD", () => {
    const records = [
      makeRecord(TODAY, "", { currencyAmounts: { PLN: "40" } }),
      makeRecord(TODAY, "5", { currencyAmounts: { PLN: "20" } }),
    ];
    const stats = getTodayStats(records, TODAY, iso);
    expect(stats.dualCurrency).toBeNull();
  });

  it("returns null dualCurrency when a record has no non-USD amount", () => {
    const records = [
      makeRecord(TODAY, "10"),
      makeRecord(TODAY, "5", { currencyAmounts: { PLN: "20" } }),
    ];
    const stats = getTodayStats(records, TODAY, iso);
    expect(stats.dualCurrency).toBeNull();
  });
});

// ─── getMtdStats ──────────────────────────────────────────────────────────────

describe("getMtdStats", () => {
  it("counts only records in current month up to today", () => {
    const records = [
      makeRecord("2026-06-01", "10"),
      makeRecord("2026-06-09", "20"),
      makeRecord("2026-06-10", "5"), // future day
      makeRecord("2026-05-31", "8"), // prior month
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.count).toBe(2);
    expect(stats.usdTotal).toBeCloseTo(30);
  });

  it("returns null deviation when no prior-month data exists", () => {
    const stats = getMtdStats([makeRecord(TODAY, "100")], TODAY, iso);
    expect(stats.deviation).toBeNull();
  });

  it("computes positive deviation vs previous month", () => {
    const records = [
      makeRecord(TODAY, "200"),         // 2026 June MTD
      makeRecord("2026-05-01", "50"),   // May (previous month comparison period)
      makeRecord("2026-05-09", "50"),
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.up).toBe(true);
    expect(stats.deviation!.priorLabel).toBe("May '26");
    expect(stats.deviation!.priorTotal).toBeCloseTo(100);
  });

  it("computes negative deviation vs previous month", () => {
    const records = [
      makeRecord(TODAY, "50"),          // 2026 June MTD
      makeRecord("2026-05-05", "200"),  // May was higher
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.deviation!.up).toBe(false);
    expect(stats.deviation!.absChange).toBeCloseTo(150);
  });

  it("correctly totals prior-month records with $-prefixed USD values", () => {
    const records = [
      makeRecord(TODAY, "200"),
      makeRecord("2026-05-01", "$100"),
      makeRecord("2026-05-09", "$50"),
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.absChange).toBeCloseTo(50); // 200 - 150
  });

  it("correctly totals prior-month records with thousands-formatted values like $2,698.19", () => {
    const records = [
      makeRecord(TODAY, "3000"),
      makeRecord("2026-05-01", "$1,500.00"),
      makeRecord("2026-05-09", "$1,198.19"),
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.absChange).toBeCloseTo(301.81); // 3000 - 2698.19
  });

  it("uses December of prior year when today is in January", () => {
    const records = [
      makeRecord("2026-01-10", "100"),  // Jan MTD
      makeRecord("2025-12-01", "40"),   // Dec (previous month)
      makeRecord("2025-12-10", "60"),
    ];
    const stats = getMtdStats(records, "2026-01-10", iso);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.priorLabel).toBe("Dec '25");
    expect(stats.deviation!.absChange).toBeCloseTo(0); // 100 - 100
  });

  it("clamps comparison day to last day of short previous month (Mar 31 → Feb 28)", () => {
    const records = [
      makeRecord("2026-03-31", "90"),   // Mar 31 MTD
      makeRecord("2026-02-01", "10"),
      makeRecord("2026-02-28", "20"),
      makeRecord("2026-02-29", "999"),  // non-existent date — not matched
    ];
    const stats = getMtdStats(records, "2026-03-31", iso);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.priorLabel).toBe("Feb '26");
    expect(stats.deviation!.absChange).toBeCloseTo(60); // 90 - 30
  });
});

// ─── getYtdStats ──────────────────────────────────────────────────────────────

describe("getYtdStats", () => {
  it("includes all records from Jan 1 through today", () => {
    const records = [
      makeRecord("2026-01-01", "100"),
      makeRecord("2026-06-09", "200"),
      makeRecord("2026-06-10", "50"), // future
      makeRecord("2025-12-31", "9"),  // prior year
    ];
    const stats = getYtdStats(records, TODAY, iso);
    expect(stats.count).toBe(2);
    expect(stats.usdTotal).toBeCloseTo(300);
  });

  it("returns null deviation when no prior-year data", () => {
    const stats = getYtdStats([makeRecord(TODAY, "100")], TODAY, iso);
    expect(stats.deviation).toBeNull();
  });

  it("labels prior year correctly", () => {
    const records = [
      makeRecord(TODAY, "100"),
      makeRecord("2025-03-01", "80"),
    ];
    const stats = getYtdStats(records, TODAY, iso);
    expect(stats.deviation!.priorLabel).toBe("2025");
    expect(stats.deviation!.priorTotal).toBeCloseTo(80);
  });
});

// ─── getYtdForecast ───────────────────────────────────────────────────────────

describe("getYtdForecast", () => {
  it("projects a common-year baseline through Dec 31 (2026)", () => {
    // Default window: Jan 1 → Jun 8 (159 days), total Jan 1 → Dec 31 = 365 days.
    const records = [
      makeRecord("2026-01-01", "100"),
      makeRecord("2026-01-02", "100"),
      makeRecord("2026-01-03", "100"),
    ];
    const forecast = getYtdForecast(records, "2026-06-09", iso);
    expect(forecast.amountUsd).toBeCloseTo((300 * 365) / 159);
  });

  it("accounts for the leap day when projecting a leap-year baseline (2024)", () => {
    // Default window: Jan 1 → Jun 8 (160 days, includes Feb 29), total = 366 days.
    const records = [
      makeRecord("2024-01-01", "100"),
      makeRecord("2024-01-02", "100"),
      makeRecord("2024-01-03", "100"),
    ];
    const forecast = getYtdForecast(records, "2024-06-09", iso);
    expect(forecast.amountUsd).toBeCloseTo(686.25);
  });

  it("applies early-January smoothing (trailing 15-day window crossing into prior year)", () => {
    // today = 2026-01-10 (before Jan 15) with no records yet in 2026 → smoothing kicks in.
    // Baseline: 2025-12-26 → 2026-01-09 (15 days). Projection: 2025-12-26 → 2026-12-31 (371 days).
    const records = [
      makeRecord("2025-12-26", "50"),
      makeRecord("2025-12-27", "50"),
      makeRecord("2025-12-28", "50"),
    ];
    const forecast = getYtdForecast(records, "2026-01-10", iso);
    expect(forecast.amountUsd).toBeCloseTo(3710);
  });

  it("applies the late-starter override when the first YTD expense is after Jan 1", () => {
    // Baseline starts at the earliest 2026 record (Mar 1), not Jan 1.
    // Baseline: Mar 1 → Jun 8 (100 days). Projection: Mar 1 → Dec 31 (306 days).
    const records = [
      makeRecord("2026-03-01", "100"),
      makeRecord("2026-03-02", "100"),
      makeRecord("2026-03-03", "100"),
    ];
    const forecast = getYtdForecast(records, "2026-06-09", iso);
    expect(forecast.amountUsd).toBeCloseTo(918);
  });

  it("prefers the late-starter override over early-January smoothing when both apply", () => {
    // today = 2026-01-10 (before Jan 15, would smooth) but earliest record is Jan 5 (late-starter).
    // Baseline: Jan 5 → Jan 9 (5 days). Projection: Jan 5 → Dec 31 (361 days).
    const records = [
      makeRecord("2026-01-05", "100"),
      makeRecord("2026-01-06", "100"),
      makeRecord("2026-01-07", "100"),
    ];
    const forecast = getYtdForecast(records, "2026-01-10", iso);
    expect(forecast.amountUsd).toBeCloseTo(21660);
  });

  it("returns null (not enough data) with only 2 distinct baseline days", () => {
    const records = [makeRecord("2026-01-01", "100"), makeRecord("2026-01-02", "100")];
    const forecast = getYtdForecast(records, "2026-06-09", iso);
    expect(forecast.amountUsd).toBeNull();
  });

  it("returns null (not enough data) with an empty records array", () => {
    const forecast = getYtdForecast([], "2026-06-09", iso);
    expect(forecast.amountUsd).toBeNull();
  });

  it("counts multiple records on the same day as a single distinct day", () => {
    // 5 records but only 2 distinct calendar days → still not enough data.
    const records = [
      makeRecord("2026-01-01", "100"),
      makeRecord("2026-01-01", "50"),
      makeRecord("2026-01-01", "25"),
      makeRecord("2026-01-02", "100"),
      makeRecord("2026-01-02", "100"),
    ];
    const forecast = getYtdForecast(records, "2026-06-09", iso);
    expect(forecast.amountUsd).toBeNull();
  });

  it("sums all records within a distinct day, not just one per day", () => {
    // 3 distinct days, but day 1 has 2 records → baseline total is 400, not 300.
    const records = [
      makeRecord("2026-01-01", "100"),
      makeRecord("2026-01-01", "100"),
      makeRecord("2026-01-02", "100"),
      makeRecord("2026-01-03", "100"),
    ];
    const forecast = getYtdForecast(records, "2026-06-09", iso);
    expect(forecast.amountUsd).toBeCloseTo((400 * 365) / 159);
  });

  it("ignores records with unparseable dates when resolving the baseline", () => {
    const records = [
      makeRecord("2026-01-01", "100"),
      makeRecord("2026-01-02", "100"),
      makeRecord("2026-01-03", "100"),
      makeRecord("not-a-date", "9999"),
    ];
    const badIso: IsoNormalizer = (s) => (s === "not-a-date" ? null : s);
    const forecast = getYtdForecast(records, "2026-06-09", badIso);
    expect(forecast.amountUsd).toBeCloseTo((300 * 365) / 159);
  });

  it("returns a forecast once a 3rd distinct baseline day is added", () => {
    const records = [
      makeRecord("2026-01-01", "100"),
      makeRecord("2026-01-02", "100"),
      makeRecord("2026-01-03", "100"),
    ];
    const forecast = getYtdForecast(records, "2026-06-09", iso);
    expect(forecast.amountUsd).not.toBeNull();
  });

  it("uses the default Jan 1 window (no smoothing) on the Jan 15 boundary", () => {
    // today = 2026-01-15 (not before Jan 15) → default window Jan 1 → Jan 14 (14 days),
    // not the smoothed 15-day trailing window.
    const records = [
      makeRecord("2026-01-01", "100"),
      makeRecord("2026-01-02", "100"),
      makeRecord("2026-01-03", "100"),
    ];
    const forecast = getYtdForecast(records, "2026-01-15", iso);
    expect(forecast.amountUsd).toBeCloseTo((300 * 365) / 14);
  });
});

// ─── getMtdDailyAmounts ───────────────────────────────────────────────────────

describe("getMtdDailyAmounts", () => {
  it("has length equal to days in the month", () => {
    const amounts = getMtdDailyAmounts([], TODAY, iso);
    expect(amounts).toHaveLength(30); // June has 30 days
  });

  it("fills past days with 0 and future days with null", () => {
    const amounts = getMtdDailyAmounts([], TODAY, iso);
    expect(amounts[0]).toBe(0);          // June 1 (past)
    expect(amounts[8]).toBe(0);          // June 9 (today)
    expect(amounts[9]).toBeNull();       // June 10 (future)
  });

  it("accumulates USD per day correctly", () => {
    const records = [
      makeRecord("2026-06-01", "15"),
      makeRecord("2026-06-01", "10"),
      makeRecord("2026-06-09", "42"),
    ];
    const amounts = getMtdDailyAmounts(records, TODAY, iso);
    expect(amounts[0]).toBeCloseTo(25); // June 1
    expect(amounts[8]).toBeCloseTo(42); // June 9
  });

  it("ignores records outside current month", () => {
    const records = [makeRecord("2026-05-31", "100"), makeRecord("2026-07-01", "100")];
    const amounts = getMtdDailyAmounts(records, TODAY, iso);
    expect(amounts.slice(0, 9).every((v) => v === 0)).toBe(true);
  });
});

// ─── getMtdWeekBoundaryPositions ─────────────────────────────────────────────

describe("getMtdWeekBoundaryPositions", () => {
  it("returns correct Monday positions for June 2026", () => {
    // June 2026: June 1 = Monday, so Mondays are at 1, 8, 15, 22, 29
    // 0-indexed positions: 0, 7, 14, 21, 28
    // But boundaries are for Mondays that are NOT the 1st day:
    // 8→7, 15→14, 22→21, 29→28
    const positions = getMtdWeekBoundaryPositions(2026, 6);
    expect(positions).toEqual([7, 14, 21, 28]);
  });

  it("returns no boundaries when month starts on Monday and has 7 days (edge)", () => {
    // Only need to check that day 1 (Monday) is NOT included as a boundary
    const positions = getMtdWeekBoundaryPositions(2026, 6);
    expect(positions).not.toContain(0);
  });
});

// ─── getRolling12mStats ───────────────────────────────────────────────────────

// R12M_TODAY = June 10, 2026
// windowStart = June 10, 2025  windowEnd = June 9, 2026
// priorStart  = June 10, 2024  priorEnd  = June 9, 2025
const R12M_TODAY = "2026-06-10";

describe("getRolling12mStats", () => {
  it("returns count=0 and no deviation when no records exist", () => {
    const stats = getRolling12mStats([], R12M_TODAY, iso);
    expect(stats.count).toBe(0);
    expect(stats.usdTotal).toBe(0);
    expect(stats.deviation).toBeNull();
  });

  it("sums records within current window and computes deviation vs prior window", () => {
    const records = [
      makeRecord("2025-06-10", "100"), // windowStart — included
      makeRecord("2026-01-15", "200"), // mid-window — included
      makeRecord("2026-06-09", "50"),  // windowEnd — included
      makeRecord("2026-06-10", "999"), // today — excluded from window
      makeRecord("2024-06-10", "80"),  // priorStart — included in prior
      makeRecord("2025-06-09", "120"), // priorEnd — included in prior
    ];
    const stats = getRolling12mStats(records, R12M_TODAY, iso);
    expect(stats.count).toBe(3);
    expect(stats.usdTotal).toBeCloseTo(350);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.priorLabel).toBe("prior 12M");
    expect(stats.deviation!.absChange).toBeCloseTo(150); // 350 - 200
    expect(stats.deviation!.up).toBe(true);
    expect(stats.deviation!.priorTotal).toBeCloseTo(200); // 80 + 120
  });

  it("returns null deviation when prior window has no records", () => {
    const stats = getRolling12mStats([makeRecord("2026-01-01", "100")], R12M_TODAY, iso);
    expect(stats.count).toBe(1);
    expect(stats.deviation).toBeNull();
  });

  it("includes record exactly on windowStart (June 10, 2025)", () => {
    const stats = getRolling12mStats([makeRecord("2025-06-10", "50")], R12M_TODAY, iso);
    expect(stats.count).toBe(1);
  });

  it("includes record exactly on windowEnd (June 9, 2026)", () => {
    const stats = getRolling12mStats([makeRecord("2026-06-09", "50")], R12M_TODAY, iso);
    expect(stats.count).toBe(1);
  });

  it("excludes record on today (June 10, 2026) from the current window", () => {
    const stats = getRolling12mStats([makeRecord("2026-06-10", "50")], R12M_TODAY, iso);
    expect(stats.count).toBe(0);
  });

  it("includes record on priorStart (June 10, 2024) in prior window", () => {
    const records = [
      makeRecord("2026-01-01", "100"), // current window
      makeRecord("2024-06-10", "80"),  // priorStart
    ];
    const stats = getRolling12mStats(records, R12M_TODAY, iso);
    expect(stats.deviation).not.toBeNull();
  });

  it("includes record on priorEnd (June 9, 2025) in prior window", () => {
    const records = [
      makeRecord("2026-01-01", "100"), // current window
      makeRecord("2025-06-09", "80"),  // priorEnd
    ];
    const stats = getRolling12mStats(records, R12M_TODAY, iso);
    expect(stats.deviation).not.toBeNull();
  });

  it("excludes record before priorStart (June 9, 2024) from prior window", () => {
    const records = [
      makeRecord("2026-01-01", "100"), // current window
      makeRecord("2024-06-09", "999"), // one day before priorStart — excluded
    ];
    const stats = getRolling12mStats(records, R12M_TODAY, iso);
    expect(stats.deviation).toBeNull();
  });

  it("handles January 1 as today — windowEnd rolls over to Dec 31 of prior year", () => {
    // today = 2026-01-01, windowEnd should be 2025-12-31
    const stats = getRolling12mStats([makeRecord("2025-12-31", "50")], "2026-01-01", iso);
    expect(stats.count).toBe(1);
  });

  it("handles today = March 1 after a leap year — windowStart is March 1 prior year", () => {
    // today = 2024-03-01 (year after 2023, non-leap)
    // windowStart = new Date(2023, 2, 1) = 2023-03-01
    // windowEnd   = new Date(2024, 2, 0) = 2024-02-29 (leap day)
    const records = [
      makeRecord("2023-03-01", "100"), // windowStart
      makeRecord("2024-02-29", "50"),  // windowEnd (leap day)
      makeRecord("2024-03-01", "999"), // today — excluded
    ];
    const stats = getRolling12mStats(records, "2024-03-01", iso);
    expect(stats.count).toBe(2);
    expect(stats.usdTotal).toBeCloseTo(150);
  });

  it("shows negative deviation when current window total is lower than prior", () => {
    const records = [
      makeRecord("2026-01-01", "50"),  // current window
      makeRecord("2025-01-01", "200"), // prior window
    ];
    const stats = getRolling12mStats(records, R12M_TODAY, iso);
    expect(stats.deviation!.up).toBe(false);
    expect(stats.deviation!.absChange).toBeCloseTo(150);
  });
});

// ─── buildIsoNormalizer ───────────────────────────────────────────────────────

describe("buildIsoNormalizer", () => {
  it("passes through ISO dates unchanged", () => {
    const normalizer = buildIsoNormalizer([makeRecord("2026-06-09", "10")]);
    expect(normalizer("2026-06-09")).toBe("2026-06-09");
  });

  it("returns null for non-ISO dates when format cannot be detected", () => {
    const normalizer = buildIsoNormalizer([]);
    expect(normalizer("not-a-date")).toBeNull();
  });

  it("converts DD/MM/YYYY sheet format to ISO", () => {
    const records = [
      makeRecord("09/06/2026", "10"),
      makeRecord("15/06/2026", "5"),
      makeRecord("20/06/2026", "8"),
    ];
    const normalizer = buildIsoNormalizer(records);
    expect(normalizer("09/06/2026")).toBe("2026-06-09");
  });
});
