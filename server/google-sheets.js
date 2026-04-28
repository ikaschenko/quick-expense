import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const currencyDictionary = JSON.parse(
  readFileSync(join(__dirname, "..", "config", "currencies.json"), "utf-8"),
);
const VALID_CURRENCY_CODES = new Set(currencyDictionary.currencies.map((c) => c.code));

const SHEET_NAME = "Expenses";
const POST_CURRENCY_HEADERS = [
  "USD",
  "Category",
  "WhoSpent",
  "ForWhom",
  "Comment",
  "PaymentChannel",
  "Theme",
];
const LEGACY_EXPENSE_HEADERS = [
  "Date",
  "PLN",
  "BYN",
  "USD",
  "EUR",
  "Category",
  "WhoSpent",
  "ForWhom",
  "Comment",
  "PaymentChannel",
  "Theme",
];
const MAX_DATASET_BYTES = 10 * 1024 * 1024;

function buildExpenseHeaders(sheetCurrencies) {
  return ["Date", ...sheetCurrencies, ...POST_CURRENCY_HEADERS];
}

/**
 * Parse the header row and extract the currency codes between Date and USD.
 * Returns null if the structure is invalid.
 */
function parseSheetCurrencies(headerRow) {
  const normalized = normalizeHeaders(headerRow);
  if (normalized[0] !== "Date") return null;

  const usdIndex = normalized.indexOf("USD");
  if (usdIndex < 1) return null;

  const postHeaders = normalized.slice(usdIndex);
  if (
    postHeaders.length !== POST_CURRENCY_HEADERS.length ||
    !POST_CURRENCY_HEADERS.every((h, i) => postHeaders[i] === h)
  ) {
    return null;
  }

  return normalized.slice(1, usdIndex);
}

function normalizeHeaders(row = []) {
  return row.map((value) => value.trim());
}

function validateHeaderRow(row) {
  const normalized = normalizeHeaders(row);
  return (
    normalized.length === EXPENSE_HEADERS.length &&
    EXPENSE_HEADERS.every((header, index) => normalized[index] === header)
  );
}

function validateLegacyHeaderRow(row) {
  const normalized = normalizeHeaders(row);
  return (
    normalized.length === LEGACY_EXPENSE_HEADERS.length &&
    LEGACY_EXPENSE_HEADERS.every((header, index) => normalized[index] === header)
  );
}

function isHeaderRowEmpty(row) {
  return !row || row.every((value) => value.trim() === "");
}

function createHeaders(accessToken, json = false) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function parseGoogleError(response) {
  let message = "Unexpected Google API error.";

  try {
    const payload = await response.json();
    if (payload.error?.message) {
      message = payload.error.message;
    }
  } catch {
    // Ignore parse failure.
  }

  const error = new Error(message);
  error.status = response.status;
  return error;
}

async function requestJson(accessToken, url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw await parseGoogleError(response);
  }

  return response.json();
}

async function requestNoContent(accessToken, url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw await parseGoogleError(response);
  }

  void accessToken;
}

async function getMetadata(accessToken, spreadsheetId) {
  const fields = encodeURIComponent("sheets.properties(sheetId,title)");
  return requestJson(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=${fields}`,
    {
      headers: createHeaders(accessToken),
    },
  );
}

async function addSheet(accessToken, spreadsheetId, title) {
  await requestJson(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title } } }],
      }),
    },
  );
}

async function getValues(accessToken, spreadsheetId, range) {
  const payload = await requestJson(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}?majorDimension=ROWS`,
    {
      headers: createHeaders(accessToken),
    },
  );

  return payload.values ?? [];
}

async function updateValues(accessToken, spreadsheetId, range, values) {
  await requestNoContent(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({
        range,
        majorDimension: "ROWS",
        values,
      }),
    },
  );
}

function remapLegacyRowToCurrent(row = []) {
  // Legacy: Date,PLN,BYN,USD,EUR,...  →  Current: Date,PLN,BYN,EUR,USD,...
  const padded = [...row];
  while (padded.length < LEGACY_EXPENSE_HEADERS.length) {
    padded.push("");
  }

  return [
    padded[0] ?? "",
    padded[1] ?? "",
    padded[2] ?? "",
    padded[4] ?? "",
    padded[3] ?? "",
    padded[5] ?? "",
    padded[6] ?? "",
    padded[7] ?? "",
    padded[8] ?? "",
    padded[9] ?? "",
    padded[10] ?? "",
  ];
}

async function migrateLegacyColumnOrder(accessToken, spreadsheetId) {
  const currentHeaders = ["Date", "PLN", "BYN", "EUR", ...POST_CURRENCY_HEADERS];
  const allRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:K`);
  const migratedRows = allRows.map((row, index) =>
    index === 0 ? [...currentHeaders] : remapLegacyRowToCurrent(row),
  );

  await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:K${migratedRows.length}`, migratedRows);
}

function mapRowsToExpenseRecords(rows, sheetCurrencies) {
  const headers = buildExpenseHeaders(sheetCurrencies);

  return rows.map((row, index) => {
    const padded = [...row];
    while (padded.length < headers.length) {
      padded.push("");
    }

    // Currency columns are between index 1 and (1 + sheetCurrencies.length)
    const currencyAmounts = {};
    for (let i = 0; i < sheetCurrencies.length; i++) {
      currencyAmounts[sheetCurrencies[i]] = padded[1 + i] ?? "";
    }

    const postStart = 1 + sheetCurrencies.length;
    return {
      Date: padded[0] ?? "",
      currencyAmounts,
      USD: padded[postStart] ?? "",
      Category: padded[postStart + 1] ?? "",
      WhoSpent: padded[postStart + 2] ?? "",
      ForWhom: padded[postStart + 3] ?? "",
      Comment: padded[postStart + 4] ?? "",
      PaymentChannel: padded[postStart + 5] ?? "",
      Theme: padded[postStart + 6] ?? "",
      rowNumber: index + 2,
    };
  });
}

function calculateJsonByteSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function parseSpreadsheetUrl(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

export async function validateSpreadsheet(accessToken, spreadsheetId, activeCurrencies = []) {
  const report = { tabAction: "found", headersAction: "valid", sheetCurrencies: [] };

  const metadata = await getMetadata(accessToken, spreadsheetId);
  const hasExpenseSheet = metadata.sheets?.some(
    (sheet) => sheet.properties?.title === SHEET_NAME,
  );

  if (!hasExpenseSheet) {
    await addSheet(accessToken, spreadsheetId, SHEET_NAME);
    report.tabAction = "created";
  }

  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const headerRow = headerRows[0];

  if (isHeaderRowEmpty(headerRow)) {
    const headers = buildExpenseHeaders(activeCurrencies);
    const endCol = columnLetter(headers.length);
    await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [headers]);
    report.headersAction = "created";
    report.sheetCurrencies = [...activeCurrencies];
    return report;
  }

  if (validateLegacyHeaderRow(headerRow)) {
    await migrateLegacyColumnOrder(accessToken, spreadsheetId);
    report.headersAction = "migrated";
    report.sheetCurrencies = ["PLN", "BYN", "EUR"];
    return report;
  }

  // Try to parse dynamic header structure
  const sheetCurrencies = parseSheetCurrencies(headerRow);
  if (sheetCurrencies === null) {
    const expectedSample = buildExpenseHeaders(activeCurrencies.length > 0 ? activeCurrencies : ["(your currencies)"]);
    const error = new Error(
      `The "${SHEET_NAME}" sheet header must start with "Date", have currency columns, then "USD, Category, WhoSpent, ForWhom, Comment, PaymentChannel, Theme".`,
    );
    error.headerDetails = {
      expected: expectedSample,
      actual: normalizeHeaders(headerRow),
    };
    throw error;
  }

  report.sheetCurrencies = sheetCurrencies;
  return report;
}

/**
 * Apply the user's active currencies onto the sheet.
 * - New currencies are inserted as columns immediately before USD.
 * - Removed currencies keep their columns (archived).
 * - Empty sheets get headers rewritten directly.
 */
export async function applyUserCurrencies(accessToken, spreadsheetId, activeCurrencies) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find(
    (sheet) => sheet.properties?.title === SHEET_NAME,
  );

  if (!expenseSheet) {
    // No sheet yet — will be created on next validateSpreadsheet call
    return { sheetCurrencies: activeCurrencies };
  }

  const sheetId = expenseSheet.properties.sheetId;
  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const headerRow = headerRows[0];

  if (isHeaderRowEmpty(headerRow)) {
    const headers = buildExpenseHeaders(activeCurrencies);
    const endCol = columnLetter(headers.length);
    await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [headers]);
    return { sheetCurrencies: activeCurrencies };
  }

  const existingCurrencies = parseSheetCurrencies(headerRow);
  if (existingCurrencies === null) {
    throw new Error("Cannot modify currencies: sheet header structure is unrecognized.");
  }

  // Determine which currencies need to be added (not yet in sheet)
  const existingSet = new Set(existingCurrencies);
  const toAdd = activeCurrencies.filter((code) => !existingSet.has(code));

  if (toAdd.length === 0) {
    return { sheetCurrencies: existingCurrencies };
  }

  // Check if sheet has data rows
  const allRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:A`);
  const hasData = allRows.length > 1;

  if (!hasData) {
    // Rewrite header row directly
    const newSheetCurrencies = [...existingCurrencies, ...toAdd];
    const headers = buildExpenseHeaders(newSheetCurrencies);
    const endCol = columnLetter(headers.length);
    await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [headers]);
    return { sheetCurrencies: newSheetCurrencies };
  }

  // Insert columns before USD (which is at index 1 + existingCurrencies.length)
  const usdColumnIndex = 1 + existingCurrencies.length;

  // Use batchUpdate to insert columns
  const requests = [];
  for (let i = 0; i < toAdd.length; i++) {
    requests.push({
      insertDimension: {
        range: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: usdColumnIndex + i,
          endIndex: usdColumnIndex + i + 1,
        },
        inheritFromBefore: false,
      },
    });
  }

  await requestJson(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({ requests }),
    },
  );

  // Write the new currency header names
  const newSheetCurrencies = [...existingCurrencies, ...toAdd];
  const newHeaders = buildExpenseHeaders(newSheetCurrencies);
  const endCol = columnLetter(newHeaders.length);
  await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [newHeaders]);

  return { sheetCurrencies: newSheetCurrencies };
}

/** Convert 1-based column count to A1 letter (1→A, 26→Z, 27→AA, etc.) */
function columnLetter(n) {
  let result = "";
  let num = n;
  while (num > 0) {
    num--;
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

export async function loadExpenses(accessToken, spreadsheetId) {
  const report = await validateSpreadsheet(accessToken, spreadsheetId);
  const sheetCurrencies = report.sheetCurrencies;
  const headers = buildExpenseHeaders(sheetCurrencies);
  const endCol = columnLetter(headers.length);
  const rows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:${endCol}`);
  const records = mapRowsToExpenseRecords(rows.slice(1), sheetCurrencies);
  const payloadBytes = calculateJsonByteSize(records);

  if (payloadBytes > MAX_DATASET_BYTES) {
    throw new Error("Spreadsheet data is too large for Tail/Search. The JSON payload exceeds 10 MB.");
  }

  return {
    records,
    payloadBytes,
    sheetCurrencies,
  };
}

export async function appendExpenseRow(accessToken, spreadsheetId, values) {
  const report = await validateSpreadsheet(accessToken, spreadsheetId);
  const headers = buildExpenseHeaders(report.sheetCurrencies);
  const endCol = columnLetter(headers.length);

  await requestNoContent(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      `${SHEET_NAME}!A:${endCol}`,
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({
        majorDimension: "ROWS",
        values: [values],
      }),
    },
  );

  return { sheetCurrencies: report.sheetCurrencies };
}

export { VALID_CURRENCY_CODES, SHEET_NAME };
