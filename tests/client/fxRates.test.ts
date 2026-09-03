import { describe, expect, it } from "vitest";
import { deriveAverageFxRatesForDate } from "../../app-web/utils/fxRates";
import { ExpenseRecord } from "../../app-web/types/expense";

function record(overrides: Partial<ExpenseRecord>): ExpenseRecord {
  return {
    Date: "2026-06-15",
    USD: "100",
    Category: "Food",
    spentBy: "test@example.com",
    spentFor: "test@example.com",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 1,
    ...overrides,
  };
}

describe("deriveAverageFxRatesForDate", () => {
  it("averages valid currency-to-USD rates for the selected date", () => {
    const rates = deriveAverageFxRatesForDate(
      [
        record({ currencyAmounts: { EUR: "90" } }),
        record({ USD: "50", currencyAmounts: { EUR: "40", GBP: "30" } }),
        record({ Date: "2026-06-14", currencyAmounts: { EUR: "999" } }),
      ],
      "2026-06-15",
      ["EUR", "GBP"],
    );

    expect(rates).toEqual({ EUR: "0.85", GBP: "0.60" });
  });

  it("leaves a currency blank when it was not used on the selected date", () => {
    const rates = deriveAverageFxRatesForDate(
      [record({ currencyAmounts: { EUR: "90" } })],
      "2026-06-15",
      ["GBP"],
    );

    expect(rates).toEqual({ GBP: "" });
  });

  it("normalizes sheet dates before matching", () => {
    const rates = deriveAverageFxRatesForDate(
      [record({ Date: "15/06/2026", currencyAmounts: { EUR: "90" } })],
      "2026-06-15",
      ["EUR"],
      (date) => date === "15/06/2026" ? "2026-06-15" : date,
    );

    expect(rates).toEqual({ EUR: "0.90" });
  });
});