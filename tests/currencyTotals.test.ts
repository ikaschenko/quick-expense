import { describe, it, expect } from "vitest";
import { ExpenseRecord } from "../src/types/expense";
import { computeDualCurrency, computeDayTotal, parseUsd, parseAmount, parseRawNumber } from "../src/utils/currencyTotals";

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

describe("parseRawNumber", () => {
  it("parses plain decimals", () => {
    expect(parseRawNumber("12.5")).toBeCloseTo(12.5);
  });

  it("parses currency-prefixed US thousands values", () => {
    expect(parseRawNumber("$2,698.19")).toBeCloseTo(2698.19);
  });

  it("parses European-formatted values", () => {
    expect(parseRawNumber("1.234,56")).toBeCloseTo(1234.56);
  });

  it("returns 0 for empty input", () => {
    expect(parseRawNumber("")).toBe(0);
  });
});

describe("parseUsd / parseAmount", () => {
  it("parseUsd reads the record's USD field", () => {
    expect(parseUsd(makeRecord("2026-06-09", "$10,035.20"))).toBeCloseTo(10035.2);
  });

  it("parseAmount parses an arbitrary string", () => {
    expect(parseAmount("40")).toBe(40);
  });
});

describe("computeDualCurrency", () => {
  it("returns null for an empty record list", () => {
    expect(computeDualCurrency([])).toBeNull();
  });

  it("returns the shared code and total when all records share one non-USD code and USD > 0", () => {
    const records = [
      makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "5", { currencyAmounts: { PLN: "20" } }),
    ];
    expect(computeDualCurrency(records)).toEqual({ code: "PLN", amount: 60 });
  });

  it("returns null when records use different non-USD codes", () => {
    const records = [
      makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "5", { currencyAmounts: { EUR: "5" } }),
    ];
    expect(computeDualCurrency(records)).toBeNull();
  });

  it("returns null when any record lacks USD", () => {
    const records = [
      makeRecord("2026-06-09", "", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "5", { currencyAmounts: { PLN: "20" } }),
    ];
    expect(computeDualCurrency(records)).toBeNull();
  });

  it("returns null when a record has no non-USD amount", () => {
    const records = [
      makeRecord("2026-06-09", "10"),
      makeRecord("2026-06-09", "5", { currencyAmounts: { PLN: "20" } }),
    ];
    expect(computeDualCurrency(records)).toBeNull();
  });
});

describe("computeDayTotal", () => {
  it("returns zero usdTotal and null dualCurrency for an empty day", () => {
    const result = computeDayTotal([]);
    expect(result.usdTotal).toBe(0);
    expect(result.dualCurrency).toBeNull();
  });

  it("sums USD across all records regardless of currency (mandatory USD total rule)", () => {
    const records = [
      makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "20", { currencyAmounts: { EUR: "18" } }),
    ];
    const result = computeDayTotal(records);
    expect(result.usdTotal).toBeCloseTo(30);
  });

  it("includes a secondary dual-currency total when the day shares one non-USD currency", () => {
    const records = [
      makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "5", { currencyAmounts: { PLN: "20" } }),
    ];
    const result = computeDayTotal(records);
    expect(result.usdTotal).toBeCloseTo(15);
    expect(result.dualCurrency).toEqual({ code: "PLN", amount: 60 });
  });

  it("omits the secondary total (silent fallback) when the day mixes multiple non-USD currencies", () => {
    const records = [
      makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "20", { currencyAmounts: { EUR: "18" } }),
    ];
    const result = computeDayTotal(records);
    expect(result.usdTotal).toBeCloseTo(30);
    expect(result.dualCurrency).toBeNull();
  });
});
