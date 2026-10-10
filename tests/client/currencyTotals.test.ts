import { describe, it, expect } from "vitest";
import { ExpenseRecord } from "../../app-web/types/expense";
import { computeDualCurrency, computeDayTotal, parseUsd, parseAmount, parseRawNumber } from "../../app-web/utils/currencyTotals";

function makeRecord(date: string, usd: string, extras: Partial<ExpenseRecord> = {}): ExpenseRecord {
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

describe("computeDualCurrency with refunds", () => {
  const options = { allowRefunds: true };

  it("returns null for no matches", () => {
    expect(computeDualCurrency([], options)).toBeNull();
  });

  it("includes refunds and preserves the default USD-positive rule", () => {
    const records = [
      makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "-4", { currencyAmounts: { PLN: "-16" } }),
    ];
    expect(computeDualCurrency(records, options)).toEqual({ code: "PLN", amount: 24 });
    expect(computeDualCurrency(records)).toBeNull();
  });

  it("displays a valid zero total when refunds cancel spending", () => {
    const records = [
      makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "-10", { currencyAmounts: { PLN: "-40" } }),
    ];
    expect(computeDualCurrency(records, options)).toEqual({ code: "PLN", amount: 0 });
  });

  it("accepts a single archived currency and ignores other blank or zero cells", () => {
    const record = makeRecord("2026-06-09", "-10", {
      currencyAmounts: { BYN: "-40", EUR: "", PLN: "0" },
    });
    expect(computeDualCurrency([record], options)).toEqual({ code: "BYN", amount: -40 });
  });

  it.each(["", " ", "0", "-0", "invalid", "10oops", "Infinity", "1e309"])(
    "suppresses the extra total for invalid or zero USD %s",
    (usd) => {
      const record = makeRecord("2026-06-09", usd, { currencyAmounts: { PLN: "40" } });
      expect(computeDualCurrency([record], options)).toBeNull();
    },
  );

  it.each<Record<string, string>>([{}, { PLN: "" }, { PLN: "0" }, { PLN: "invalid" }, { PLN: "40oops" },
    { PLN: "Infinity" }, { PLN: "40", EUR: "5" }, { PLN: "40", EUR: "invalid" }])(
    "suppresses missing, zero, malformed or multiple currencies %j",
    (currencyAmounts) => {
      const record = makeRecord("2026-06-09", "10", { currencyAmounts });
      expect(computeDualCurrency([record], options)).toBeNull();
    },
  );

  it("suppresses differing currency codes", () => {
    const records = [
      makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "40" } }),
      makeRecord("2026-06-09", "-5", { currencyAmounts: { EUR: "-5" } }),
    ];
    expect(computeDualCurrency(records, options)).toBeNull();
  });

  it("uses existing US and European number formatting", () => {
    const records = [
      makeRecord("2026-06-09", "$1,200.50", { currencyAmounts: { EUR: "1.100,50" } }),
      makeRecord("2026-06-09", "-100.50", { currencyAmounts: { EUR: "-100,50" } }),
    ];
    expect(computeDualCurrency(records, options)).toEqual({ code: "EUR", amount: 1000 });
  });

  it("uses the same strict parsing for validation and summing", () => {
    const record = makeRecord("2026-06-09", "10", { currencyAmounts: { PLN: "4e1" } });
    expect(computeDualCurrency([record], options)).toEqual({ code: "PLN", amount: 40 });
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

  it("sums negative (refund) USD amounts without producing NaN", () => {
    const records = [
      makeRecord("2026-06-09", "10"),
      makeRecord("2026-06-09", "-4"),
    ];
    const result = computeDayTotal(records);
    expect(result.usdTotal).toBeCloseTo(6);
    expect(Number.isNaN(result.usdTotal)).toBe(false);
  });

  it("falls back to 0 (not NaN) for a malformed/non-numeric USD value", () => {
    const records = [
      makeRecord("2026-06-09", "not-a-number"),
      makeRecord("2026-06-09", "20"),
    ];
    const result = computeDayTotal(records);
    expect(result.usdTotal).toBeCloseTo(20);
    expect(Number.isNaN(result.usdTotal)).toBe(false);
  });

  it("sums ALL records for the day regardless of Category or spentBy (no hidden filtering)", () => {
    const records = [
      makeRecord("2026-06-09", "10", { Category: "Groceries", spentBy: "Alice" }),
      makeRecord("2026-06-09", "20", { Category: "Rent", spentBy: "Bob" }),
      makeRecord("2026-06-09", "5", { Category: "Misc", spentBy: "Alice" }),
    ];
    const result = computeDayTotal(records);
    expect(result.usdTotal).toBeCloseTo(35);
  });
});
