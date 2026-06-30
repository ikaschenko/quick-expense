import { filterExpenses } from "../src/utils/search";
import { ExpenseRecord, SearchFilters } from "../src/types/expense";

const records: ExpenseRecord[] = [
  {
    rowNumber: 2,
    Date: "2026-03-01",
    USD: "10.00",
    currencyAmounts: {},
    Category: "Food",
    spentBy: "ivan@example.com",
    Comment: "Dinner at home",
    customFields: { SpentFor: "Family", Channel: "cash", Theme: "Daily" },
  },
  {
    rowNumber: 3,
    Date: "2026-03-02",
    USD: "20.00",
    currencyAmounts: {},
    Category: "Travel",
    spentBy: "ivan@example.com",
    Comment: "Airport taxi",
    customFields: { SpentFor: "", Channel: "card", Theme: "Trip" },
  },
];

/** Build a full SearchFilters with defaults for unspecified fields. */
function f(overrides: Partial<SearchFilters>): SearchFilters {
  return { comment: "", categories: [], amountFrom: "", amountTo: "", customFields: {}, ...overrides };
}

describe("expense search", () => {
  it("matches comment substring case-insensitively", () => {
    const outcome = filterExpenses(records, f({ categories: [], comment: "DINNER" }));

    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].Category).toBe("Food");
  });

  it("applies category and comment with AND logic", () => {
    const outcome = filterExpenses(records, f({ categories: ["Travel"], comment: "taxi" }));

    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(3);
  });

  it("matches all parts of a space-separated query in any order", () => {
    const outcome = filterExpenses(records, f({ comment: "dinner home" }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("is order-independent: 'home dinner' matches 'Dinner at home'", () => {
    const outcome = filterExpenses(records, f({ comment: "home dinner" }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("returns no match when one part is absent", () => {
    const outcome = filterExpenses(records, f({ comment: "dinner airport" }));
    expect(outcome.allMatches).toHaveLength(0);
  });

  it("ignores leading and trailing spaces", () => {
    const a = filterExpenses(records, f({ comment: "  dinner  " }));
    const b = filterExpenses(records, f({ comment: "dinner" }));
    expect(a.allMatches).toEqual(b.allMatches);
  });

  it("treats consecutive spaces as one separator", () => {
    const a = filterExpenses(records, f({ comment: "dinner  home" }));
    const b = filterExpenses(records, f({ comment: "dinner home" }));
    expect(a.allMatches).toEqual(b.allMatches);
  });

  it.each([
    ["*"],
    ["  * "],
    ["a"],
  ])("does not apply comment filter when input has fewer than 2 meaningful chars: %s", (comment) => {
    const outcome = filterExpenses(records, f({ comment }));
    expect(outcome.allMatches).toHaveLength(records.length);
  });

  it("applies comment filter when input has exactly 2 meaningful chars", () => {
    const outcome = filterExpenses(records, f({ comment: "di" }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("matches category filter case-insensitively", () => {
    const outcome = filterExpenses(records, f({ categories: ["food"] }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].Category).toBe("Food");
  });
});

describe("filterExpenses — amount range", () => {
  it("amountFrom excludes records below threshold", () => {
    const outcome = filterExpenses(records, f({ amountFrom: "15" }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(3); // USD 20
  });

  it("amountTo excludes records above threshold", () => {
    const outcome = filterExpenses(records, f({ amountTo: "15" }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2); // USD 10
  });

  it("amountFrom + amountTo together form a range", () => {
    const outcome = filterExpenses(records, f({ amountFrom: "5", amountTo: "15" }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2); // USD 10
  });

  it("non-numeric amountFrom is treated as no-op", () => {
    const outcome = filterExpenses(records, f({ amountFrom: "abc" }));
    expect(outcome.allMatches).toHaveLength(records.length);
  });

  it("non-numeric amountTo is treated as no-op", () => {
    const outcome = filterExpenses(records, f({ amountTo: "xyz" }));
    expect(outcome.allMatches).toHaveLength(records.length);
  });

  it("record with non-numeric USD is excluded when amount filter is active", () => {
    const nanRecord: ExpenseRecord = {
      rowNumber: 99,
      Date: "2026-03-03",
      USD: "n/a",
      currencyAmounts: {},
      Category: "Other",
      spentBy: "",
      Comment: "",
      customFields: {},
    };
    const outcome = filterExpenses([...records, nanRecord], f({ amountFrom: "5" }));
    expect(outcome.allMatches.some((r) => r.rowNumber === 99)).toBe(false);
  });

  it("USD value with thousands comma separator matches amount range filter", () => {
    const formattedRecord: ExpenseRecord = {
      rowNumber: 10,
      Date: "2026-03-05",
      USD: "1,234.56",
      currencyAmounts: {},
      Category: "Shopping",
      spentBy: "ivan@example.com",
      Comment: "Large purchase",
      customFields: {},
    };
    const outcome = filterExpenses([formattedRecord], f({ amountFrom: "1000" }));
    expect(outcome.allMatches).toHaveLength(1);
  });

  it.each([
    ["$15,000.25", "1000",  1],
    ["$500.00",    "1000",  0],
  ])("dollar-formatted USD '%s' against amountFrom %s → %i result(s)", (usd, amountFrom, expected) => {
    const record: ExpenseRecord = {
      rowNumber: 20,
      Date: "2024-01-15",
      USD: usd,
      currencyAmounts: {},
      Category: "Other",
      spentBy: "",
      Comment: "",
      customFields: {},
    };
    const outcome = filterExpenses([record], f({ amountFrom }));
    expect(outcome.allMatches).toHaveLength(expected);
  });

  it.each([
    ["$500.00",    "1000",  1],
    ["$15,000.25", "1000",  0],
  ])("dollar-formatted USD '%s' against amountTo %s → %i result(s)", (usd, amountTo, expected) => {
    const record: ExpenseRecord = {
      rowNumber: 21,
      Date: "2024-01-16",
      USD: usd,
      currencyAmounts: {},
      Category: "Other",
      spentBy: "",
      Comment: "",
      customFields: {},
    };
    const outcome = filterExpenses([record], f({ amountTo }));
    expect(outcome.allMatches).toHaveLength(expected);
  });
});

describe("filterExpenses — custom field filters", () => {
  it("customFields SpentFor matches row 2 exactly", () => {
    const outcome = filterExpenses(records, f({ customFields: { SpentFor: "Family" } }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("customFields SpentFor substring match is case-insensitive", () => {
    const outcome = filterExpenses(records, f({ customFields: { SpentFor: "fam" } }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("customFields SpentFor empty string is a no-op", () => {
    const outcome = filterExpenses(records, f({ customFields: { SpentFor: "" } }));
    expect(outcome.allMatches).toHaveLength(records.length);
  });

  it("customFields single-char value is a no-op (< 2 meaningful chars)", () => {
    const outcome = filterExpenses(records, f({ customFields: { SpentFor: "F" } }));
    expect(outcome.allMatches).toHaveLength(records.length);
  });

  it("combined: category + amountFrom + customField applies AND logic", () => {
    // row 2: Food, USD 10, SpentFor=Family
    // row 3: Travel, USD 20, SpentFor=""
    const outcome = filterExpenses(records, f({
      categories: ["Food"],
      amountFrom: "5",
      customFields: { SpentFor: "Family" },
    }));
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });
});

describe("filterExpenses truncation", () => {
  function makeRecord(rowNumber: number, comment: string): ExpenseRecord {
    return {
      rowNumber,
      Date: `2020-01-${String(rowNumber).padStart(2, "0")}`,
      USD: "1.00",
      currencyAmounts: {},
      Category: "Test",
      spentBy: "",
      Comment: comment,
      customFields: {},
    };
  }

  // 101 records all matching "allegro", row 2 = oldest, row 102 = newest
  const bigRecords: ExpenseRecord[] = Array.from({ length: 101 }, (_, i) =>
    makeRecord(i + 2, "allegro.pl - item"),
  );

  it("when matches exceed 100, visibleMatches contains the newest 100, not the oldest", () => {
    const outcome = filterExpenses(bigRecords, f({ comment: "allegro" }));
    expect(outcome.allMatches).toHaveLength(101);
    expect(outcome.truncated).toBe(true);
    expect(outcome.visibleMatches).toHaveLength(100);
    // oldest record (rowNumber 2) must be excluded
    expect(outcome.visibleMatches.some((r) => r.rowNumber === 2)).toBe(false);
    // newest record (rowNumber 102) must be included
    expect(outcome.visibleMatches.some((r) => r.rowNumber === 102)).toBe(true);
  });

  it("when matches are exactly 100, all are visible and truncated is false", () => {
    const outcome = filterExpenses(bigRecords.slice(0, 100), f({ comment: "allegro" }));
    expect(outcome.truncated).toBe(false);
    expect(outcome.visibleMatches).toHaveLength(100);
  });
});
