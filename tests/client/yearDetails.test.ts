import { describe, it, expect } from "vitest";
import { getYearMonthlyAmounts, getYearlyAverageSpend } from "../../app-web/utils/yearDetails";
import { buildIsoNormalizer } from "../../app-web/utils/dashboardStats";
import { ExpenseRecord } from "../../app-web/types/expense";

function makeRecord(date: string, usd: string): ExpenseRecord {
  return {
    Date: date,
    USD: usd,
    Category: "Misc",
    spentBy: "test",
    spentFor: "test",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 1,
  };
}

describe("getYearMonthlyAmounts", () => {
  it("returns actual totals for a past completed year, including $0 months", () => {
    const records = [makeRecord("2025-01-05", "100"), makeRecord("2025-01-20", "50"), makeRecord("2025-03-10", "20")];
    const toIso = buildIsoNormalizer(records);
    const amounts = getYearMonthlyAmounts(records, 2025, toIso, "2026-06-15");
    expect(amounts).toHaveLength(12);
    expect(amounts[0]).toBe(150);
    expect(amounts[1]).toBe(0);
    expect(amounts[2]).toBe(20);
    expect(amounts[11]).toBe(0);
  });

  it("marks months after the current month as null forecast placeholders for the current year", () => {
    const records = [makeRecord("2026-06-01", "10")];
    const toIso = buildIsoNormalizer(records);
    const amounts = getYearMonthlyAmounts(records, 2026, toIso, "2026-06-15");
    expect(amounts[5]).toBe(10);
    expect(amounts[6]).toBeNull();
    expect(amounts[11]).toBeNull();
    expect(amounts[0]).toBe(0);
  });

  it("returns an all-null-free array of zeros when there are no records for the year", () => {
    const toIso = buildIsoNormalizer([]);
    const amounts = getYearMonthlyAmounts([], 2024, toIso, "2026-06-15");
    expect(amounts).toEqual(new Array(12).fill(0));
  });
});

describe("getYearlyAverageSpend", () => {
  it("returns null when the year has no records", () => {
    const toIso = buildIsoNormalizer([]);
    expect(getYearlyAverageSpend([], 2024, toIso, "2026-06-15")).toBeNull();
  });

  it("prorates by day-of-year for the current year", () => {
    const records = [makeRecord("2026-01-01", "365")];
    const toIso = buildIsoNormalizer(records);
    // Day-of-year for June 15 2026 is 166 (non-leap year); elapsedMonths = 166/365*12 ≈ 5.4575
    const average = getYearlyAverageSpend(records, 2026, toIso, "2026-06-15");
    expect(average).toBeCloseTo(365 / ((166 / 365) * 12), 4);
  });

  it("divides by day-based months between earliest and latest expense for a past year", () => {
    const records = [makeRecord("2024-01-01", "100"), makeRecord("2024-07-01", "100")];
    const toIso = buildIsoNormalizer(records);
    const spanDays = Math.round(
      (new Date(2024, 6, 1).getTime() - new Date(2024, 0, 1).getTime()) / (24 * 60 * 60 * 1000),
    );
    const months = spanDays / (365.25 / 12);
    const average = getYearlyAverageSpend(records, 2024, toIso, "2026-06-15");
    expect(average).toBeCloseTo(200 / months, 4);
  });

  it("floors the denominator at 1 month when all records fall on the same day (past year)", () => {
    const records = [makeRecord("2024-03-10", "300")];
    const toIso = buildIsoNormalizer(records);
    const average = getYearlyAverageSpend(records, 2024, toIso, "2026-06-15");
    expect(average).toBeCloseTo(300 / 1, 4);
  });
});
