import { filterExpenses } from "../src/utils/search";
import { ExpenseRecord } from "../src/types/expense";

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

describe("expense search", () => {
  it("matches comment substring case-insensitively", () => {
    const outcome = filterExpenses(records, {
      categories: [],
      comment: "DINNER",
    });

    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].Category).toBe("Food");
  });

  it("applies category and comment with AND logic", () => {
    const outcome = filterExpenses(records, {
      categories: ["Travel"],
      comment: "taxi",
    });

    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(3);
  });

  it("matches all parts of a space-separated query in any order", () => {
    const outcome = filterExpenses(records, { categories: [], comment: "dinner home" });
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("is order-independent: 'home dinner' matches 'Dinner at home'", () => {
    const outcome = filterExpenses(records, { categories: [], comment: "home dinner" });
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("returns no match when one part is absent", () => {
    const outcome = filterExpenses(records, { categories: [], comment: "dinner airport" });
    expect(outcome.allMatches).toHaveLength(0);
  });

  it("ignores leading and trailing spaces", () => {
    const a = filterExpenses(records, { categories: [], comment: "  dinner  " });
    const b = filterExpenses(records, { categories: [], comment: "dinner" });
    expect(a.allMatches).toEqual(b.allMatches);
  });

  it("treats consecutive spaces as one separator", () => {
    const a = filterExpenses(records, { categories: [], comment: "dinner  home" });
    const b = filterExpenses(records, { categories: [], comment: "dinner home" });
    expect(a.allMatches).toEqual(b.allMatches);
  });

  it.each([
    ["*"],
    ["  * "],
    ["a"],
  ])("does not apply comment filter when input has fewer than 2 meaningful chars: %s", (comment) => {
    const outcome = filterExpenses(records, { categories: [], comment });
    expect(outcome.allMatches).toHaveLength(records.length);
  });

  it("applies comment filter when input has exactly 2 meaningful chars", () => {
    const outcome = filterExpenses(records, { categories: [], comment: "di" });
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("matches category filter case-insensitively", () => {
    const outcome = filterExpenses(records, { categories: ["food"], comment: "" });
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].Category).toBe("Food");
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
    const outcome = filterExpenses(bigRecords, { categories: [], comment: "allegro" });
    expect(outcome.allMatches).toHaveLength(101);
    expect(outcome.truncated).toBe(true);
    expect(outcome.visibleMatches).toHaveLength(100);
    // oldest record (rowNumber 2) must be excluded
    expect(outcome.visibleMatches.some((r) => r.rowNumber === 2)).toBe(false);
    // newest record (rowNumber 102) must be included
    expect(outcome.visibleMatches.some((r) => r.rowNumber === 102)).toBe(true);
  });

  it("when matches are exactly 100, all are visible and truncated is false", () => {
    const outcome = filterExpenses(bigRecords.slice(0, 100), { categories: [], comment: "allegro" });
    expect(outcome.truncated).toBe(false);
    expect(outcome.visibleMatches).toHaveLength(100);
  });
});
