import { describe, it, expect } from "vitest";
import { ExpenseRecord } from "../../app-web/types/expense";
import { IsoNormalizer } from "../../app-web/utils/dashboardStats";
import {
  getAverageDailySpend,
  computePriorMonthRange,
  getCategoryBreakdown,
} from "../../app-web/utils/monthDetails";

const iso: IsoNormalizer = (s) => s; // dates already in ISO in tests

function makeRecord(date: string, usd: string, category: string): ExpenseRecord {
  return {
    Date: date,
    USD: usd,
    Category: category,
    spentBy: "test",
    spentFor: "test",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 1,
  };
}

// ─── getAverageDailySpend ─────────────────────────────────────────────────────

describe("getAverageDailySpend", () => {
  it("divides total USD by inclusive calendar day count, including $0 days", () => {
    const records = [makeRecord("2026-08-01", "100", "Food")];
    // Aug 1 → Aug 4 = 4 inclusive days, only day 1 has spend
    expect(getAverageDailySpend(records, "2026-08-01", "2026-08-04", iso)).toBeCloseTo(25);
  });

  it("returns 0 when there are no records in range", () => {
    expect(getAverageDailySpend([], "2026-08-01", "2026-08-06", iso)).toBe(0);
  });

  it("computes a single-day range as that day's total", () => {
    const records = [makeRecord("2026-08-01", "50", "Food")];
    expect(getAverageDailySpend(records, "2026-08-01", "2026-08-01", iso)).toBeCloseTo(50);
  });
});

// ─── computePriorMonthRange ───────────────────────────────────────────────────

describe("computePriorMonthRange", () => {
  it("shifts both dates back one calendar month", () => {
    expect(computePriorMonthRange("2026-08-01", "2026-08-15")).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-15",
    });
  });

  it("clamps day-of-month into a shorter previous month (Mar 31 → Feb)", () => {
    expect(computePriorMonthRange("2026-03-01", "2026-03-31")).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
    });
  });

  it("rolls back across a year boundary (Jan → prior Dec)", () => {
    expect(computePriorMonthRange("2026-01-01", "2026-01-10")).toEqual({
      startDate: "2025-12-01",
      endDate: "2025-12-10",
    });
  });
});

// ─── getCategoryBreakdown ─────────────────────────────────────────────────────

describe("getCategoryBreakdown", () => {
  it("sorts rows descending by current-month amount", () => {
    const records = [
      makeRecord("2026-08-01", "10", "Utilities"),
      makeRecord("2026-08-02", "30", "Food"),
    ];
    const rows = getCategoryBreakdown(records, "2026-08-01", "2026-08-05", iso, { grouped: false });
    expect(rows.map((r) => r.label)).toEqual(["Food", "Utilities"]);
  });

  it("shows '-' (priorAmount null) and omits deviation when category had no prior spend", () => {
    const records = [makeRecord("2026-08-01", "20", "Food")];
    const rows = getCategoryBreakdown(records, "2026-08-01", "2026-08-05", iso, { grouped: false });
    expect(rows[0].priorAmount).toBeNull();
    expect(rows[0].deviationPct).toBeNull();
  });

  it("omits deviation (never +Infinity%) when the prior amount is exactly $0", () => {
    const records = [
      makeRecord("2026-08-01", "20", "Food"),
      makeRecord("2026-07-01", "0", "Food"),
    ];
    const rows = getCategoryBreakdown(records, "2026-08-01", "2026-08-31", iso, { grouped: false });
    const food = rows.find((r) => r.label === "Food")!;
    expect(food.priorAmount).toBe(0);
    expect(food.deviationPct).toBeNull();
  });

  it("computes a signed deviation percentage vs the comparable prior-month amount", () => {
    const records = [
      makeRecord("2026-08-01", "115", "Food"),
      makeRecord("2026-07-01", "100", "Food"),
    ];
    const rows = getCategoryBreakdown(records, "2026-08-01", "2026-08-31", iso, { grouped: false });
    const food = rows.find((r) => r.label === "Food")!;
    expect(food.priorAmount).toBe(100);
    expect(food.deviationPct).toBeCloseTo(15);
  });

  it("groups colliding categories by first-3-characters, letting a grouped total outrank an ungrouped competitor", () => {
    const records = [
      makeRecord("2026-08-01", "5", "Food"),
      makeRecord("2026-08-02", "7", "Food - dining out"),
      makeRecord("2026-08-03", "10", "Utilities"),
    ];
    const rows = getCategoryBreakdown(records, "2026-08-01", "2026-08-05", iso, { grouped: true });
    expect(rows[0]).toMatchObject({ label: "Foo...", currentAmount: 12 });
    expect(rows[1]).toMatchObject({ label: "Utilities", currentAmount: 10 });
  });

  it("leaves a category unchanged when its 3-char prefix has no match with any other category", () => {
    const records = [
      makeRecord("2026-08-01", "10", "Groceries"),
      makeRecord("2026-08-02", "5", "Transport"),
    ];
    const rows = getCategoryBreakdown(records, "2026-08-01", "2026-08-05", iso, { grouped: true });
    expect(rows.map((r) => r.label)).toEqual(["Groceries", "Transport"]);
  });

  it("does not group a current-period category when its only prefix collision is a prior-only category", () => {
    const records = [
      makeRecord("2026-08-01", "10", "Food"),
      makeRecord("2026-07-01", "5", "Food - takeout"),
    ];
    const rows = getCategoryBreakdown(records, "2026-08-01", "2026-08-31", iso, { grouped: true });
    expect(rows[0]).toMatchObject({ label: "Food", currentAmount: 10 });
  });

  it("merges groups case-insensitively, using the first-encountered record's casing for the label", () => {
    const records = [
      makeRecord("2026-08-01", "5", "food"),
      makeRecord("2026-08-02", "7", "Food - junk"),
    ];
    const rows = getCategoryBreakdown(records, "2026-08-01", "2026-08-05", iso, { grouped: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "foo...", currentAmount: 12 });
  });
});
