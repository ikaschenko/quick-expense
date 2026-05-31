import { getCustomColumnLabel, getDisplayAmount, hasDetails } from "../src/utils/expenseTable";
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
  it("returns true when comment is non-empty, even if short", () => {
    const record = makeRecord({ Comment: "short" });
    expect(hasDetails(record, ["SpentFor"])).toBe(true);
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

describe("getDisplayAmount", () => {
  it("returns only USD (as $) when no other currency", () => {
    const record = makeRecord({ USD: "50.00", currencyAmounts: {} });
    expect(getDisplayAmount(record, [])).toBe("$50");
  });

  it("returns local currency only when USD is empty", () => {
    const record = makeRecord({ USD: "", currencyAmounts: { PLN: "200" } });
    expect(getDisplayAmount(record, ["PLN"])).toBe("PLN 200");
  });

  it("returns local / $USD when both present, without decimals", () => {
    const record = makeRecord({ USD: "50.00", currencyAmounts: { PLN: "200.50" } });
    expect(getDisplayAmount(record, ["PLN"])).toBe("PLN 200 / $50");
  });

  it("returns em dash when no amounts present", () => {
    const record = makeRecord({ USD: "", currencyAmounts: {} });
    expect(getDisplayAmount(record, [])).toBe("\u2014");
  });

  it("skips empty currency amounts and falls back to USD", () => {
    const record = makeRecord({ USD: "10.00", currencyAmounts: { PLN: "  " } });
    expect(getDisplayAmount(record, ["PLN"])).toBe("$10");
  });

  it("strips leading $ already present in raw USD value", () => {
    const record = makeRecord({ USD: "$19.00", currencyAmounts: { PLN: "70" } });
    expect(getDisplayAmount(record, ["PLN"])).toBe("PLN 70 / $19");
  });
});
