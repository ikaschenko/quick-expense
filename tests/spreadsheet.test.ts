import {
  buildDistinctValues,
  mapRowsToExpenseRecords,
  parseSpreadsheetUrl,
  validateHeaderRow,
} from "../src/utils/spreadsheet";
import { buildExpenseHeaders } from "../src/constants/expenses";

const SAMPLE_CURRENCIES = ["PLN", "BYN", "EUR"];

describe("spreadsheet utilities", () => {
  it("parses spreadsheet id from a Google Sheets URL", () => {
    expect(
      parseSpreadsheetUrl(
        "https://docs.google.com/spreadsheets/d/abc123DEF_456/edit#gid=0",
      ),
    ).toBe("abc123DEF_456");
  });

  it("validates exact header order with dynamic currencies", () => {
    const headers = buildExpenseHeaders(SAMPLE_CURRENCIES);
    expect(validateHeaderRow([...headers], SAMPLE_CURRENCIES)).toBe(true);
    // Wrong order: Date missing currencies
    expect(validateHeaderRow(["Date", "USD", "Category", "WhoSpent", "ForWhom", "Comment", "PaymentChannel", "Theme"], [])).toBe(true);
    expect(validateHeaderRow(["Date", "PLN", "Category"], SAMPLE_CURRENCIES)).toBe(false);
  });

  it("maps sheet rows to records with dynamic currencies", () => {
    const records = mapRowsToExpenseRecords(
      [
        ["2026-03-01", "12.34", "", "", "3.20", "Food", "a@example.com", "", "", "cash", ""],
        ["2026-03-02", "", "", "", "5.00", "Travel", "b@example.com", "Family", "", "card", "Trip"],
        ["2026-03-03", "", "", "", "7.00", "Food", "a@example.com", "", "", "cash", "Trip"],
      ],
      SAMPLE_CURRENCIES,
    );

    expect(records[0].rowNumber).toBe(2);
    expect(records[0].USD).toBe("3.20");
    expect(records[0].currencyAmounts.PLN).toBe("12.34");
    expect(records[0].currencyAmounts.EUR).toBe("");

    expect(buildDistinctValues(records)).toEqual({
      Category: ["Food", "Travel"],
      WhoSpent: ["a@example.com", "b@example.com"],
      ForWhom: ["Family"],
      PaymentChannel: ["card", "cash"],
      Theme: ["Trip"],
    });
  });

  it("maps rows correctly with no optional currencies", () => {
    const records = mapRowsToExpenseRecords(
      [["2026-03-01", "5.00", "Food", "a@example.com", "", "", "cash", ""]],
      [],
    );

    expect(records[0].USD).toBe("5.00");
    expect(records[0].Category).toBe("Food");
    expect(records[0].currencyAmounts).toEqual({});
  });
});
