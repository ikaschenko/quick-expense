// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { getCustomColumnLabel, hasDetails } from "../src/components/ExpenseTable";
import { ExpenseRecord } from "../src/types/expense";

function makeRecord(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    Date: "2026-01-01",
    USD: "10.00",
    Category: "Food",
    spentBy: "a@example.com",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
    rowNumber: 1,
    ...overrides,
  };
}

describe("getCustomColumnLabel", () => {
  it("maps SpentFor to Spent For", () => {
    expect(getCustomColumnLabel("SpentFor")).toBe("Spent For");
  });

  it("returns other names unchanged", () => {
    expect(getCustomColumnLabel("Theme")).toBe("Theme");
    expect(getCustomColumnLabel("Channel")).toBe("Channel");
    expect(getCustomColumnLabel("PaymentChannel")).toBe("PaymentChannel");
  });
});

describe("hasDetails", () => {
  it("returns false when comment is short and no custom fields", () => {
    const record = makeRecord({ Comment: "short" });
    expect(hasDetails(record, ["SpentFor"])).toBe(false);
  });

  it("returns false when comment is empty and all custom field values are empty", () => {
    const record = makeRecord({ Comment: "", customFields: { SpentFor: "  " } });
    expect(hasDetails(record, ["SpentFor"])).toBe(false);
  });

  it("returns true when comment exceeds preview length", () => {
    const record = makeRecord({ Comment: "a".repeat(73) });
    expect(hasDetails(record, [])).toBe(true);
  });

  it("returns true when comment is empty but a custom field has a value", () => {
    const record = makeRecord({ Comment: "", customFields: { SpentFor: "Family" } });
    expect(hasDetails(record, ["SpentFor"])).toBe(true);
  });

  it("returns true when comment is short but a custom field has a value", () => {
    const record = makeRecord({ Comment: "short", customFields: { SpentFor: "Family" } });
    expect(hasDetails(record, ["SpentFor"])).toBe(true);
  });
});
