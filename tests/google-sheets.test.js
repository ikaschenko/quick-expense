// @vitest-environment node
const SHEET_NAME = "Expenses";
const LEGACY_EXPENSE_HEADERS = [
  "Date", "PLN", "BYN", "USD", "EUR",
  "Category", "WhoSpent", "ForWhom", "Comment", "PaymentChannel", "Theme",
];
const NEW_FIXED_HEADERS_NOCURR = ["Date", "USD", "Category", "Spent By", "Comment"];
const DEFAULT_CUSTOM = ["SpentFor", "Channel", "Theme"];

const mockFetch = vi.fn();
global.fetch = mockFetch;

let validateSpreadsheet;
let parseSpreadsheetUrl;
let loadExpenses;
let appendExpenseRow;
let hasExactItemSet;
let readConfigSheetMapping;
let writeConfigSheetMapping;

beforeAll(async () => {
  ({
    validateSpreadsheet, parseSpreadsheetUrl, loadExpenses, appendExpenseRow, hasExactItemSet,
    readConfigSheetMapping, writeConfigSheetMapping,
  } = await import("../server/google-sheets.js"));
});

beforeEach(() => {
  mockFetch.mockReset();
});

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function setupFetchSequence(responses) {
  responses.forEach((r) => mockFetch.mockResolvedValueOnce(r));
}

describe("parseSpreadsheetUrl", () => {
  it("extracts spreadsheet ID from a standard URL", () => {
    expect(
      parseSpreadsheetUrl("https://docs.google.com/spreadsheets/d/abc123-_x/edit"),
    ).toBe("abc123-_x");
  });

  it("returns null for an invalid URL", () => {
    expect(parseSpreadsheetUrl("https://example.com")).toBeNull();
  });
});

describe("validateSpreadsheet", () => {
  const TOKEN = "test-token";
  const SHEET_ID = "spreadsheet-123";

  function metadataResponse(sheetNames) {
    return jsonResponse({
      sheets: sheetNames.map((title, i) => ({ properties: { sheetId: i, title } })),
    });
  }

  function headerResponse(headers) {
    return jsonResponse({ values: headers ? [headers] : [] });
  }

  function batchUpdateResponse() {
    return jsonResponse({ replies: [{}] });
  }

  function updateValuesResponse() {
    return { ok: true, status: 200, json: () => Promise.resolve({}) };
  }

  it("auto-creates tab and headers when Expenses tab is missing", async () => {
    setupFetchSequence([
      // getMetadata — no Expenses tab
      metadataResponse(["Sheet1"]),
      // addSheet (batchUpdate)
      batchUpdateResponse(),
      // getValues for header row (empty after creation)
      headerResponse(null),
      // updateValues to write headers
      updateValuesResponse(),
    ]);

    const report = await validateSpreadsheet(TOKEN, SHEET_ID);

    expect(report.tabAction).toBe("created");
    expect(report.headersAction).toBe("created");
    expect(report.sheetCurrencies).toEqual([]);
    expect(report.customColumns).toEqual(DEFAULT_CUSTOM);

    // Verify addSheet was called (2nd fetch call)
    const addSheetCall = mockFetch.mock.calls[1];
    expect(addSheetCall[0]).toContain(":batchUpdate");
    const addSheetBody = JSON.parse(addSheetCall[1].body);
    expect(addSheetBody.requests[0].addSheet.properties.title).toBe(SHEET_NAME);
  });

  it("creates headers when Expenses tab exists but is empty", async () => {
    setupFetchSequence([
      // getMetadata — Expenses tab exists
      metadataResponse(["Expenses"]),
      // getValues for header row — empty
      headerResponse(null),
      // updateValues to write headers
      updateValuesResponse(),
    ]);

    const report = await validateSpreadsheet(TOKEN, SHEET_ID);

    expect(report.tabAction).toBe("found");
    expect(report.headersAction).toBe("created");
    expect(report.sheetCurrencies).toEqual([]);
    expect(report.customColumns).toEqual(DEFAULT_CUSTOM);
  });

  it("returns valid when Expenses tab has correct dynamic headers with custom columns", async () => {
    const dynamicHeaders = ["Date", "PLN", "BYN", "EUR", "USD", "Category", "Spent By", "Comment", "SpentFor", "Channel", "Theme"];
    setupFetchSequence([
      metadataResponse(["Expenses"]),
      headerResponse([...dynamicHeaders]),
    ]);

    const report = await validateSpreadsheet(TOKEN, SHEET_ID);

    expect(report.tabAction).toBe("found");
    expect(report.headersAction).toBe("valid");
    expect(report.sheetCurrencies).toEqual(["PLN", "BYN", "EUR"]);
    expect(report.customColumns).toEqual(["SpentFor", "Channel", "Theme"]);
  });

  it("returns valid with no custom columns", async () => {
    const headers = ["Date", "PLN", "USD", "Category", "Spent By", "Comment"];
    setupFetchSequence([
      metadataResponse(["Expenses"]),
      headerResponse([...headers]),
    ]);

    const report = await validateSpreadsheet(TOKEN, SHEET_ID);

    expect(report.headersAction).toBe("valid");
    expect(report.sheetCurrencies).toEqual(["PLN"]);
    expect(report.customColumns).toEqual([]);
  });

  it("migrates legacy headers and reports migration", async () => {
    setupFetchSequence([
      metadataResponse(["Expenses"]),
      // getValues for header row — legacy format
      headerResponse([...LEGACY_EXPENSE_HEADERS]),
      // getValues for all rows (migration reads full sheet)
      jsonResponse({ values: [[...LEGACY_EXPENSE_HEADERS], ["2024-01-01", "100", "", "50", "25", "Food", "user@test.com", "", "", "", ""]] }),
      // updateValues for migration
      updateValuesResponse(),
    ]);

    const report = await validateSpreadsheet(TOKEN, SHEET_ID);

    expect(report.tabAction).toBe("found");
    expect(report.headersAction).toBe("migrated");
    expect(report.sheetCurrencies).toEqual(["PLN", "BYN", "EUR"]);
  });

  it("throws with headerDetails when headers are invalid (missing SpentBy)", async () => {
    const badHeaders = ["Date", "USD", "Category", "WhoSpent", "Comment"];

    setupFetchSequence([
      metadataResponse(["Expenses"]),
      headerResponse(badHeaders),
    ]);

    try {
      await validateSpreadsheet(TOKEN, SHEET_ID);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error.message).toContain("header");
    }
  });

  it("throws on Google API error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: { message: "Spreadsheet not found" } }, 404),
    );

    await expect(validateSpreadsheet(TOKEN, SHEET_ID)).rejects.toThrow("Spreadsheet not found");
  });
});

describe("loadExpenses", () => {
  const TOKEN = "test-token";
  const SHEET_ID = "spreadsheet-123";

  function metadataResponse(sheetNames) {
    return jsonResponse({
      sheets: sheetNames.map((title, i) => ({ properties: { sheetId: i, title } })),
    });
  }

  function valuesResponse(rows) {
    return jsonResponse({ values: rows });
  }

  it("maps Comment correctly when custom columns appear before Comment in the sheet", async () => {
    // Sheet header: Date, PLN, USD, Category, SpentBy, SpentFor, Comment, Channel, Theme
    // SpentFor is BEFORE Comment — this was the bug case
    const header = ["Date", "PLN", "USD", "Category", "Spent By", "SpentFor", "Comment", "Channel", "Theme"];
    const dataRow = ["2026-01-01", "100", "25", "Food", "ivan@x.com", "Family", "samsung galaxy", "cash", "Tech"];

    setupFetchSequence([
      // validateSpreadsheet: getMetadata
      metadataResponse(["Expenses"]),
      // validateSpreadsheet: getValues for header row
      valuesResponse([header]),
      // loadExpenses: getValues for all rows
      valuesResponse([header, dataRow]),
    ]);

    const result = await loadExpenses(TOKEN, SHEET_ID);

    expect(result.records).toHaveLength(1);
    const record = result.records[0];
    expect(record.Comment).toBe("samsung galaxy");
    expect(record.customFields.SpentFor).toBe("Family");
    expect(record.customFields.Channel).toBe("cash");
    expect(record.customFields.Theme).toBe("Tech");
    expect(record.Category).toBe("Food");
    expect(record.USD).toBe("25");
  });

  it("maps Comment correctly when custom columns appear after Comment in the sheet (standard order)", async () => {
    // Standard header: Date, PLN, USD, Category, SpentBy, Comment, SpentFor, Channel, Theme
    const header = ["Date", "PLN", "USD", "Category", "Spent By", "Comment", "SpentFor", "Channel", "Theme"];
    const dataRow = ["2026-01-01", "100", "25", "Travel", "ivan@x.com", "allegro order", "Self", "card", "Trip"];

    setupFetchSequence([
      metadataResponse(["Expenses"]),
      valuesResponse([header]),
      valuesResponse([header, dataRow]),
    ]);

    const result = await loadExpenses(TOKEN, SHEET_ID);

    expect(result.records).toHaveLength(1);
    const record = result.records[0];
    expect(record.Comment).toBe("allegro order");
    expect(record.customFields.SpentFor).toBe("Self");
    expect(record.customFields.Channel).toBe("card");
  });

  it("maps records correctly when the sheet header casing differs", async () => {
    const header = ["Date", "pln", "USD", "Category", "spent by", "SpentFor", "comment", "Channel", "Theme"];
    const dataRow = ["2026-01-01", "100", "25", "Food", "ivan@x.com", "Family", "samsung galaxy", "cash", "Tech"];

    setupFetchSequence([
      metadataResponse(["Expenses"]),
      valuesResponse([header]),
      valuesResponse([header, dataRow]),
    ]);

    const result = await loadExpenses(TOKEN, SHEET_ID);

    expect(result.records).toHaveLength(1);
    expect(result.records[0].spentBy).toBe("ivan@x.com");
    expect(result.records[0].Comment).toBe("samsung galaxy");
  });
});

describe("appendExpenseRow", () => {
  const TOKEN = "test-token";
  const SHEET_ID = "spreadsheet-123";

  function metadataResponse(sheetNames) {
    return jsonResponse({
      sheets: sheetNames.map((title, i) => ({ properties: { sheetId: i, title } })),
    });
  }

  function valuesResponse(rows) {
    return jsonResponse({ values: rows });
  }

  function appendResponse() {
    return { ok: true, status: 200, json: () => Promise.resolve({}) };
  }

  it("aligns outgoing row values to actual header order when custom columns appear before Comment", async () => {
    const header = ["Date", "PLN", "USD", "Category", "Spent By", "SpentFor", "Comment", "Channel", "Theme"];
    const canonicalValues = [
      "2026-01-02",
      "120",
      "30",
      "Food",
      "ivan@x.com",
      "samsung galaxy",
      "Family",
      "cash",
      "Tech",
    ];

    setupFetchSequence([
      // validateSpreadsheet
      metadataResponse(["Expenses"]),
      valuesResponse([header]),
      // appendExpenseRow alignment read
      valuesResponse([header]),
      // append call
      appendResponse(),
    ]);

    await appendExpenseRow(TOKEN, SHEET_ID, canonicalValues);

    const appendCall = mockFetch.mock.calls[3];
    expect(appendCall[0]).toContain(":append");
    const body = JSON.parse(appendCall[1].body);

    // Expected order by actual header:
    // Date, PLN, USD, Category, Spent By, SpentFor, Comment, Channel, Theme
    expect(body.values[0]).toEqual([
      "2026-01-02",
      "120",
      "30",
      "Food",
      "ivan@x.com",
      "Family",
      "samsung galaxy",
      "cash",
      "Tech",
    ]);
  });

  it("keeps canonical value order when sheet header is already standard", async () => {
    const header = ["Date", "PLN", "USD", "Category", "Spent By", "Comment", "SpentFor", "Channel", "Theme"];
    const canonicalValues = [
      "2026-01-03",
      "90",
      "22",
      "Travel",
      "ivan@x.com",
      "allegro order",
      "Self",
      "card",
      "Trip",
    ];

    setupFetchSequence([
      metadataResponse(["Expenses"]),
      valuesResponse([header]),
      valuesResponse([header]),
      appendResponse(),
    ]);

    await appendExpenseRow(TOKEN, SHEET_ID, canonicalValues);

    const appendCall = mockFetch.mock.calls[3];
    const body = JSON.parse(appendCall[1].body);
    expect(body.values[0]).toEqual(canonicalValues);
  });

  it("aligns outgoing row values when actual header casing differs", async () => {
    const header = ["Date", "pln", "USD", "Category", "spent by", "SpentFor", "comment", "Channel", "Theme"];
    const canonicalValues = [
      "2026-01-04",
      "77",
      "19",
      "Other",
      "ivan@x.com",
      "note text",
      "Family",
      "cash",
      "Trip",
    ];

    setupFetchSequence([
      metadataResponse(["Expenses"]),
      valuesResponse([header]),
      valuesResponse([header]),
      appendResponse(),
    ]);

    await appendExpenseRow(TOKEN, SHEET_ID, canonicalValues);

    const appendCall = mockFetch.mock.calls[3];
    const body = JSON.parse(appendCall[1].body);
    expect(body.values[0]).toEqual([
      "2026-01-04",
      "77",
      "19",
      "Other",
      "ivan@x.com",
      "Family",
      "note text",
      "cash",
      "Trip",
    ]);
  });
});

describe("hasExactItemSet", () => {
  it("rejects duplicate entries even when the unique items match", () => {
    expect(hasExactItemSet(["A", "B"], ["A", "A"])).toBe(false);
  });

  it("accepts the same items in a different order", () => {
    expect(hasExactItemSet(["A", "B", "C"], ["c", "b", "a"])).toBe(true);
  });
});

describe("readConfigSheetMapping", () => {
  const TOKEN = "test-token";
  const SHEET_ID = "spreadsheet-123";

  function metadataResponse(sheetNames) {
    return jsonResponse({
      sheets: sheetNames.map((title, i) => ({ properties: { sheetId: i, title } })),
    });
  }

  function valuesResponse(rows) {
    return jsonResponse({ values: rows });
  }

  it("returns null when Config sheet does not exist", async () => {
    setupFetchSequence([metadataResponse(["Expenses"])]);
    const result = await readConfigSheetMapping(TOKEN, SHEET_ID);
    expect(result).toBeNull();
  });

  it("returns the parsed mapping when Config sheet has a valid column_mapping row", async () => {
    const mapping = { USD: "Amount", "Spent By": "WhoSpent" };
    setupFetchSequence([
      metadataResponse(["Expenses", "Config"]),
      valuesResponse([["schema_version", "1"], ["column_mapping", JSON.stringify(mapping)]]),
    ]);
    const result = await readConfigSheetMapping(TOKEN, SHEET_ID);
    expect(result).toEqual(mapping);
  });

  it("returns { error: 'invalid' } when column_mapping row is missing", async () => {
    setupFetchSequence([
      metadataResponse(["Expenses", "Config"]),
      valuesResponse([["schema_version", "1"]]),
    ]);
    const result = await readConfigSheetMapping(TOKEN, SHEET_ID);
    expect(result).toEqual({ error: "invalid" });
  });

  it("returns { error: 'invalid' } when column_mapping value is malformed JSON", async () => {
    setupFetchSequence([
      metadataResponse(["Expenses", "Config"]),
      valuesResponse([["column_mapping", "not-json"]]),
    ]);
    const result = await readConfigSheetMapping(TOKEN, SHEET_ID);
    expect(result).toEqual({ error: "invalid" });
  });

  it("returns null (never throws) when a network error occurs", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network failure"));
    const result = await readConfigSheetMapping(TOKEN, SHEET_ID);
    expect(result).toBeNull();
  });
});

describe("loadExpenses with column mapping", () => {
  const TOKEN = "test-token";
  const SHEET_ID = "spreadsheet-123";

  function metadataResponse(sheetNames) {
    return jsonResponse({
      sheets: sheetNames.map((title, i) => ({ properties: { sheetId: i, title } })),
    });
  }

  function valuesResponse(rows) {
    return jsonResponse({ values: rows });
  }

  it("reads data using user column names and returns QE field names", async () => {
    // User sheet has "Amount" instead of "USD" and "WhoSpent" instead of "Spent By"
    const header = ["Date", "Amount", "Category", "WhoSpent", "Comment"];
    const dataRow = ["2026-01-01", "42", "Food", "alice", "lunch"];
    const mapping = { USD: "Amount", "Spent By": "WhoSpent" };

    setupFetchSequence([
      metadataResponse(["Expenses"]),
      valuesResponse([header]),
      valuesResponse([header, dataRow]),
    ]);

    const result = await loadExpenses(TOKEN, SHEET_ID, mapping);
    expect(result.records).toHaveLength(1);
    const record = result.records[0];
    expect(record.USD).toBe("42");
    expect(record.spentBy).toBe("alice");
    expect(record.Comment).toBe("lunch");
    expect(record.Category).toBe("Food");
  });
});
