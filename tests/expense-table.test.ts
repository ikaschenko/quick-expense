import { findDuplicateExpenses, getCustomColumnLabel, getDisplayAmount, getDisplayAmountFull, hasDetails } from "../src/utils/expenseTable";
import { ExpenseDraft, ExpenseRecord } from "../src/types/expense";

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

function makeDraft(overrides: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    Date: "2026-01-01",
    USD: "10.00",
    Category: "Food",
    spentBy: "a@example.com",
    Comment: "",
    currencyAmounts: {},
    customFields: {},
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

describe("getDisplayAmountFull", () => {
  it("returns USD with decimals preserved", () => {
    const record = makeRecord({ USD: "50.07", currencyAmounts: {} });
    expect(getDisplayAmountFull(record, [])).toBe("$50.07");
  });

  it("returns local currency with decimals when USD is empty", () => {
    const record = makeRecord({ USD: "", currencyAmounts: { PLN: "200.50" } });
    expect(getDisplayAmountFull(record, ["PLN"])).toBe("PLN 200.50");
  });

  it("returns both amounts with decimals preserved", () => {
    const record = makeRecord({ USD: "50.07", currencyAmounts: { PLN: "200.50" } });
    expect(getDisplayAmountFull(record, ["PLN"])).toBe("PLN 200.50 / $50.07");
  });

  it("returns em dash when no amounts present", () => {
    const record = makeRecord({ USD: "", currencyAmounts: {} });
    expect(getDisplayAmountFull(record, [])).toBe("\u2014");
  });

  it("skips empty currency amounts and falls back to USD", () => {
    const record = makeRecord({ USD: "10.99", currencyAmounts: { PLN: "  " } });
    expect(getDisplayAmountFull(record, ["PLN"])).toBe("$10.99");
  });

  it("strips leading $ already present in raw USD value", () => {
    const record = makeRecord({ USD: "$19.00", currencyAmounts: { PLN: "70.25" } });
    expect(getDisplayAmountFull(record, ["PLN"])).toBe("PLN 70.25 / $19.00");
  });
});

describe("findDuplicateExpenses", () => {
  it("returns a matching record with identical date, category, and USD", () => {
    const records = [makeRecord()];
    const draft = makeDraft();
    expect(findDuplicateExpenses(draft, records, [])).toEqual(records);
  });

  it("returns empty array when no records exist", () => {
    expect(findDuplicateExpenses(makeDraft(), [], [])).toEqual([]);
  });

  it("does not match when date differs", () => {
    const records = [makeRecord({ Date: "2026-01-02" })];
    expect(findDuplicateExpenses(makeDraft(), records, [])).toEqual([]);
  });

  it("does not match when category differs", () => {
    const records = [makeRecord({ Category: "Transport" })];
    expect(findDuplicateExpenses(makeDraft(), records, [])).toEqual([]);
  });

  it("matches category case-insensitively", () => {
    const records = [makeRecord({ Category: "FOOD" })];
    expect(findDuplicateExpenses(makeDraft({ Category: "food" }), records, [])).toEqual(records);
  });

  it("does not match when USD amount differs beyond tolerance", () => {
    const records = [makeRecord({ USD: "10.50" })];
    expect(findDuplicateExpenses(makeDraft({ USD: "10.00" }), records, [])).toEqual([]);
  });

  it("matches USD amounts within 0.005 tolerance", () => {
    const records = [makeRecord({ USD: "10.004" })];
    expect(findDuplicateExpenses(makeDraft({ USD: "10.00" }), records, [])).toEqual(records);
  });

  it("handles comma-decimal USD in draft", () => {
    const records = [makeRecord({ USD: "10.00" })];
    expect(findDuplicateExpenses(makeDraft({ USD: "10,00" }), records, [])).toEqual(records);
  });

  it("falls back to non-USD currencies when USD is empty or zero", () => {
    const records = [makeRecord({ USD: "", currencyAmounts: { PLN: "200.00" } })];
    const draft = makeDraft({ USD: "", currencyAmounts: { PLN: "200.00" } });
    expect(findDuplicateExpenses(draft, records, ["PLN"])).toEqual(records);
  });

  it("does not match on non-USD when amounts differ", () => {
    const records = [makeRecord({ USD: "", currencyAmounts: { PLN: "200.00" } })];
    const draft = makeDraft({ USD: "", currencyAmounts: { PLN: "150.00" } });
    expect(findDuplicateExpenses(draft, records, ["PLN"])).toEqual([]);
  });

  it("returns multiple matching records", () => {
    const r1 = makeRecord({ rowNumber: 1 });
    const r2 = makeRecord({ rowNumber: 2 });
    const unrelated = makeRecord({ rowNumber: 3, Category: "Other" });
    expect(findDuplicateExpenses(makeDraft(), [r1, r2, unrelated], [])).toEqual([r1, r2]);
  });

  it("matches by non-USD currency even when USD values differ (different FX rates)", () => {
    const records = [makeRecord({ USD: "8.55", currencyAmounts: { PLN: "32.15" } })];
    const draft = makeDraft({ USD: "8.53", currencyAmounts: { PLN: "32.15" } });
    expect(findDuplicateExpenses(draft, records, ["PLN"])).toEqual(records);
  });

  it("matches despite surrounding whitespace in record category", () => {
    const records = [makeRecord({ Category: " Food " })];
    expect(findDuplicateExpenses(makeDraft(), records, [])).toEqual(records);
  });
});
