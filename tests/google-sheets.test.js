// @vitest-environment node
const SHEET_NAME = "Expenses";
const EXPENSE_HEADERS = [
  "Date", "PLN", "BYN", "EUR", "USD",
  "Category", "WhoSpent", "ForWhom", "Comment", "PaymentChannel", "Theme",
];
const LEGACY_EXPENSE_HEADERS = [
  "Date", "PLN", "BYN", "USD", "EUR",
  "Category", "WhoSpent", "ForWhom", "Comment", "PaymentChannel", "Theme",
];

const mockFetch = vi.fn();
global.fetch = mockFetch;

let validateSpreadsheet;
let parseSpreadsheetUrl;

beforeAll(async () => {
  ({ validateSpreadsheet, parseSpreadsheetUrl } = await import("../server/google-sheets.js"));
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

    expect(report).toEqual({
      tabAction: "created",
      headersAction: "created",
    });

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

    expect(report).toEqual({
      tabAction: "found",
      headersAction: "created",
    });
  });

  it("returns valid when Expenses tab has correct headers", async () => {
    setupFetchSequence([
      metadataResponse(["Expenses"]),
      headerResponse([...EXPENSE_HEADERS]),
    ]);

    const report = await validateSpreadsheet(TOKEN, SHEET_ID);

    expect(report).toEqual({
      tabAction: "found",
      headersAction: "valid",
    });
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

    expect(report).toEqual({
      tabAction: "found",
      headersAction: "migrated",
    });
  });

  it("throws with headerDetails when headers are invalid", async () => {
    const badHeaders = ["Date", "USD", "PLN", "BYN", "EUR", "Cat", "Who", "For", "Note", "Pay", "Tag"];

    setupFetchSequence([
      metadataResponse(["Expenses"]),
      headerResponse(badHeaders),
    ]);

    try {
      await validateSpreadsheet(TOKEN, SHEET_ID);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error.message).toContain("header must match");
      expect(error.headerDetails).toEqual({
        expected: [...EXPENSE_HEADERS],
        actual: badHeaders,
      });
    }
  });

  it("throws on Google API error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: { message: "Spreadsheet not found" } }, 404),
    );

    await expect(validateSpreadsheet(TOKEN, SHEET_ID)).rejects.toThrow("Spreadsheet not found");
  });
});
