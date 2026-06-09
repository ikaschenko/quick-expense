import { describe, it, expect } from "vitest";
import { ExpenseRecord } from "../src/types/expense";
import {
  getTodayStats,
  getMtdStats,
  getYtdStats,
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

  it("returns null deviation when no prior-year data exists", () => {
    const stats = getMtdStats([makeRecord(TODAY, "100")], TODAY, iso);
    expect(stats.deviation).toBeNull();
  });

  it("computes positive deviation vs prior year", () => {
    const records = [
      makeRecord(TODAY, "200"),         // 2026 June MTD
      makeRecord("2025-06-01", "50"),   // 2025 June (prior year comparison period)
      makeRecord("2025-06-09", "50"),
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.up).toBe(true);
    expect(stats.deviation!.priorLabel).toBe("Jun '25");
  });

  it("computes negative deviation vs prior year", () => {
    const records = [
      makeRecord(TODAY, "50"),          // 2026 June MTD
      makeRecord("2025-06-05", "200"),  // 2025 June was higher
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.deviation!.up).toBe(false);
    expect(stats.deviation!.absChange).toBeCloseTo(150);
  });

  it("correctly totals prior-year records with $-prefixed USD values", () => {
    const records = [
      makeRecord(TODAY, "200"),
      makeRecord("2025-06-01", "$100"),
      makeRecord("2025-06-09", "$50"),
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.absChange).toBeCloseTo(50); // 200 - 150
  });

  it("correctly totals prior-year records with thousands-formatted values like $2,698.19", () => {
    const records = [
      makeRecord(TODAY, "3000"),
      makeRecord("2025-06-01", "$1,500.00"),
      makeRecord("2025-06-09", "$1,198.19"),
    ];
    const stats = getMtdStats(records, TODAY, iso);
    expect(stats.deviation).not.toBeNull();
    expect(stats.deviation!.absChange).toBeCloseTo(301.81); // 3000 - 2698.19
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
  });
});

// ─── getMtdDailyAmounts ───────────────────────────────────────────────────────

describe("getMtdDailyAmounts", () => {
  it("has length equal to days in the month", () => {
    const amounts = getMtdDailyAmounts([], TODAY, iso);
    expect(amounts).toHaveLength(30); // June has 30 days
  });

  it("fills past days with 0 and future days with NaN", () => {
    const amounts = getMtdDailyAmounts([], TODAY, iso);
    expect(amounts[0]).toBe(0);          // June 1 (past)
    expect(amounts[8]).toBe(0);          // June 9 (today)
    expect(isNaN(amounts[9])).toBe(true); // June 10 (future)
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
