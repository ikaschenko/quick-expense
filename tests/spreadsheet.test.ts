import {
  buildDistinctValues,
  mapRowsToExpenseRecords,
  parseSpreadsheetUrl,
  validateHeaderRow,
} from "../src/utils/spreadsheet";
import { EXPENSE_HEADERS } from "../src/constants/expenses";

describe("spreadsheet utilities", () => {
  it("parses spreadsheet id from a Google Sheets URL", () => {
    expect(
      parseSpreadsheetUrl(
        "https://docs.google.com/spreadsheets/d/abc123DEF_456/edit#gid=0",
      ),
    ).toBe("abc123DEF_456");
  });

  it("validates exact header order", () => {
    expect(validateHeaderRow([...EXPENSE_HEADERS])).toBe(true);
    expect(validateHeaderRow(["Date", ...EXPENSE_HEADERS.slice(2)])).toBe(false);
  });

  it("maps sheet rows to records and extracts distinct values", () => {
    const records = mapRowsToExpenseRecords([
      ["2026-03-01", "12.34", "", "", "3.20", "Food", "a@example.com", "", "", "cash", ""],
      ["2026-03-02", "", "", "", "5.00", "Travel", "b@example.com", "Family", "", "card", "Trip"],
      ["2026-03-03", "", "", "", "7.00", "Food", "a@example.com", "", "", "cash", "Trip"],
    ]);

    expect(records[0].rowNumber).toBe(2);
    expect(records[0].USD).toBe("3.20");
    expect(records[0].EUR).toBe("");

    expect(buildDistinctValues(records)).toEqual({
      Category: ["Food", "Travel"],
      WhoSpent: ["a@example.com", "b@example.com"],
      ForWhom: ["Family"],
      PaymentChannel: ["card", "cash"],
      Theme: ["Trip"],
    });
  });
});
