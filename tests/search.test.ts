import { filterExpenses } from "../src/utils/search";
import { ExpenseRecord } from "../src/types/expense";

const records: ExpenseRecord[] = [
  {
    rowNumber: 2,
    Date: "2026-03-01",
    USD: "10.00",
    currencyAmounts: {},
    Category: "Food",
    WhoSpent: "ivan@example.com",
    ForWhom: "Family",
    Comment: "Dinner at home",
    PaymentChannel: "cash",
    Theme: "Daily",
  },
  {
    rowNumber: 3,
    Date: "2026-03-02",
    USD: "20.00",
    currencyAmounts: {},
    Category: "Travel",
    WhoSpent: "ivan@example.com",
    ForWhom: "",
    Comment: "Airport taxi",
    PaymentChannel: "card",
    Theme: "Trip",
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

  it("matches all parts of a wildcard query in any order", () => {
    const outcome = filterExpenses(records, { categories: [], comment: "dinner*home" });
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("is order-independent: home*dinner matches Dinner at home", () => {
    const outcome = filterExpenses(records, { categories: [], comment: "home*dinner" });
    expect(outcome.allMatches).toHaveLength(1);
    expect(outcome.allMatches[0].rowNumber).toBe(2);
  });

  it("returns no match when one part is absent", () => {
    const outcome = filterExpenses(records, { categories: [], comment: "dinner*airport" });
    expect(outcome.allMatches).toHaveLength(0);
  });

  it("ignores leading and trailing wildcards", () => {
    const a = filterExpenses(records, { categories: [], comment: "*dinner*" });
    const b = filterExpenses(records, { categories: [], comment: "dinner" });
    expect(a.allMatches).toEqual(b.allMatches);
  });

  it("treats consecutive wildcards as one", () => {
    const a = filterExpenses(records, { categories: [], comment: "dinner**home" });
    const b = filterExpenses(records, { categories: [], comment: "dinner*home" });
    expect(a.allMatches).toEqual(b.allMatches);
  });

  it.each([
    ["*"],
    ["**"],
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
});
