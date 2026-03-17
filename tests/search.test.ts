import { filterExpenses } from "../src/utils/search";
import { ExpenseRecord } from "../src/types/expense";

const records: ExpenseRecord[] = [
  {
    rowNumber: 2,
    Date: "2026-03-01",
    PLN: "",
    BYN: "",
    USD: "10.00",
    EUR: "",
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
    PLN: "",
    BYN: "",
    USD: "20.00",
    EUR: "",
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
});
