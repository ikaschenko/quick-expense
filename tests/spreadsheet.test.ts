import {
  buildCommentSuggestions,
  buildDistinctValues,
  deriveHeaderRowDetails,
  mapRowsToExpenseRecords,
  mergeCategories,
  parseSpreadsheetUrl,
  validateColumnName,
} from "../src/utils/spreadsheet";

const SAMPLE_CURRENCIES = ["PLN", "BYN", "EUR"];
const SAMPLE_CUSTOM = ["SpentFor", "Channel", "Theme"];

describe("spreadsheet utilities", () => {
  it("parses spreadsheet id from a Google Sheets URL", () => {
    expect(
      parseSpreadsheetUrl(
        "https://docs.google.com/spreadsheets/d/abc123DEF_456/edit#gid=0",
      ),
    ).toBe("abc123DEF_456");
  });

  it("maps sheet rows to records with currencies and custom columns", () => {
    const records = mapRowsToExpenseRecords(
      [
        ["2026-03-01", "12.34", "", "", "3.20", "Food", "a@example.com", "", "SpentFor-val", "card", "trip"],
        ["2026-03-02", "", "", "", "5.00", "Travel", "b@example.com", "note", "", "", ""],
        ["2026-03-03", "", "", "", "7.00", "Food", "a@example.com", "", "", "cash", "trip"],
      ],
      SAMPLE_CURRENCIES,
      SAMPLE_CUSTOM,
    );

    expect(records[0].rowNumber).toBe(2);
    expect(records[0].USD).toBe("3.20");
    expect(records[0].currencyAmounts.PLN).toBe("12.34");
    expect(records[0].currencyAmounts.EUR).toBe("");
    expect(records[0].spentBy).toBe("a@example.com");
    expect(records[0].customFields["SpentFor"]).toBe("SpentFor-val");
    expect(records[0].customFields["Channel"]).toBe("card");
    expect(records[0].customFields["Theme"]).toBe("trip");

    expect(buildDistinctValues(records, SAMPLE_CUSTOM)).toEqual({
      Category: ["Food", "Travel"],
      spentBy: ["a@example.com", "b@example.com"],
      customFields: {
        SpentFor: ["SpentFor-val"],
        Channel: ["card", "cash"],
        Theme: ["trip"],
      },
    });
  });

  it("deduplicates categories case-insensitively, preferring the capitalized variant", () => {
    const records = mapRowsToExpenseRecords(
      [
        ["2026-03-01", "5.00", "pocket money", "a@example.com", ""],
        ["2026-03-02", "5.00", "Pocket Money", "a@example.com", ""],
        ["2026-03-03", "5.00", "internet", "a@example.com", ""],
        ["2026-03-04", "5.00", "Internet", "a@example.com", ""],
      ],
      [],
      [],
    );

    expect(buildDistinctValues(records).Category).toEqual(["Internet", "Pocket Money"]);
  });

  it("maps rows correctly with no currencies and no custom columns", () => {
    const records = mapRowsToExpenseRecords(
      [["2026-03-01", "5.00", "Food", "a@example.com", ""]],
      [],
      [],
    );

    expect(records[0].USD).toBe("5.00");
    expect(records[0].Category).toBe("Food");
    expect(records[0].spentBy).toBe("a@example.com");
    expect(records[0].customFields).toEqual({});
  });

  describe("validateColumnName", () => {
    it("rejects empty names", () => {
      expect(validateColumnName("", [])).not.toBeNull();
      expect(validateColumnName("   ", [])).not.toBeNull();
    });

    it("rejects names over 30 characters", () => {
      expect(validateColumnName("a".repeat(31), [])).not.toBeNull();
      expect(validateColumnName("a".repeat(30), [])).toBeNull();
    });

    it("rejects reserved names (case-insensitive)", () => {
      expect(validateColumnName("Date", [])).not.toBeNull();
      expect(validateColumnName("USD", [])).not.toBeNull();
      expect(validateColumnName("Category", [])).not.toBeNull();
      expect(validateColumnName("spent by", [])).not.toBeNull();
      expect(validateColumnName("COMMENT", [])).not.toBeNull();
    });

    it("rejects duplicate names (case-insensitive)", () => {
      expect(validateColumnName("Channel", ["channel", "Theme"])).not.toBeNull();
    });

    it("allows renaming to the same name (excludeName)", () => {
      expect(validateColumnName("Channel", ["Channel", "Theme"], "Channel")).toBeNull();
    });

    it("accepts valid names with special characters and non-ASCII", () => {
      expect(validateColumnName("Канал", [])).toBeNull();
      expect(validateColumnName("My Column #1", [])).toBeNull();
    });
  });
});

describe("deriveHeaderRowDetails", () => {
  it("returns 'match' for columns that are identical", () => {
    const result = deriveHeaderRowDetails({
      expected: ["Date", "USD", "Category"],
      actual: ["Date", "USD", "Category"],
      detectedColumns: [],
    });
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.status === "match")).toBe(true);
  });

  it("returns 'mismatch' when expected and actual differ", () => {
    const result = deriveHeaderRowDetails({
      expected: ["Date", "USD", "Category"],
      actual: ["Date", "Amount", "Category"],
      detectedColumns: [],
    });
    expect(result[1]).toEqual({ index: 1, expected: "USD", actual: "Amount", status: "mismatch" });
  });

  it("returns 'missing' when actual row is shorter than expected", () => {
    const result = deriveHeaderRowDetails({
      expected: ["Date", "USD", "Category", "Comment"],
      actual: ["Date", "USD"],
      detectedColumns: [],
    });
    expect(result[2]).toEqual({ index: 2, expected: "Category", actual: "(missing)", status: "missing" });
    expect(result[3]).toEqual({ index: 3, expected: "Comment", actual: "(missing)", status: "missing" });
  });

  it("returns 'extra' when actual row is longer than expected", () => {
    const result = deriveHeaderRowDetails({
      expected: ["Date", "USD"],
      actual: ["Date", "USD", "Notes", "Tags"],
      detectedColumns: [],
    });
    expect(result[2]).toEqual({ index: 2, expected: "(none)", actual: "Notes", status: "extra" });
    expect(result[3]).toEqual({ index: 3, expected: "(none)", actual: "Tags", status: "extra" });
  });

  it("handles empty expected and actual arrays", () => {
    const result = deriveHeaderRowDetails({
      expected: [],
      actual: [],
      detectedColumns: [],
    });
    expect(result).toEqual([]);
  });
});

describe("mergeCategories", () => {
  it("returns the dataset array unchanged when predefined is empty", () => {
    const dataset = ["Food", "Travel"];
    expect(mergeCategories(dataset, [])).toBe(dataset);
  });

  it("returns predefined list sorted when dataset is empty", () => {
    expect(mergeCategories([], ["Housing", "Car", "Food & Groceries"])).toEqual([
      "Car",
      "Food & Groceries",
      "Housing",
    ]);
  });

  it("deduplicates and sorts alphabetically across the full merged set", () => {
    expect(mergeCategories(["Food", "Travel"], ["Car", "Food", "Housing"])).toEqual([
      "Car",
      "Food",
      "Housing",
      "Travel",
    ]);
  });

  it("deduplication is case-insensitive, preferring the capitalized variant", () => {
    expect(mergeCategories(["food"], ["Food"])).toEqual(["Food"]);
  });

  it("keeps first occurrence when neither variant starts with a capital", () => {
    expect(mergeCategories(["food"], ["fOOD"])).toEqual(["food"]);
  });

  it("keeps first occurrence when both variants start with a capital", () => {
    expect(mergeCategories(["Food"], ["FOOD"])).toEqual(["Food"]);
  });
});

describe("buildCommentSuggestions", () => {
  function makeRecord(comment: string): Parameters<typeof buildCommentSuggestions>[0][number] {
    return {
      rowNumber: 1, Date: "2026-01-01", USD: "1", Category: "X",
      spentBy: "a@b.com", Comment: comment, currencyAmounts: {}, customFields: {},
    };
  }

  it("returns an empty array for an empty records list", () => {
    expect(buildCommentSuggestions([])).toEqual([]);
  });

  it("returns an empty array when all comments are empty or whitespace", () => {
    expect(buildCommentSuggestions([makeRecord(""), makeRecord("   ")])).toEqual([]);
  });

  it("returns comments in recency order — last record first", () => {
    const records = [
      makeRecord("first comment"),
      makeRecord("second comment"),
      makeRecord("third comment"),
    ];
    expect(buildCommentSuggestions(records)).toEqual([
      "third comment",
      "second comment",
      "first comment",
    ]);
  });

  it("deduplicates case-insensitively, keeping casing of the most recent occurrence", () => {
    const records = [
      makeRecord("Coffee"),    // oldest
      makeRecord("coffee"),    // newer — wins for the lowercase key
    ];
    expect(buildCommentSuggestions(records)).toEqual(["coffee"]);
  });

  it("keeps only the first seen occurrence (most recent) per unique lowercase key", () => {
    const records = [
      makeRecord("Lunch"),     // oldest
      makeRecord("Taxi"),
      makeRecord("lunch"),     // most recent for "lunch" key — appears first in result
    ];
    expect(buildCommentSuggestions(records)).toEqual(["lunch", "Taxi"]);
  });

  it("trims whitespace before comparing and storing", () => {
    const records = [makeRecord("  coffee  "), makeRecord("coffee")];
    expect(buildCommentSuggestions(records)).toEqual(["coffee"]);
  });
});
