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
// Fixed columns that always appear after the currency block, in this exact order.
const POST_CURRENCY_FIXED = ["USD", "Category", "SpentBy", "Comment"];
// Legacy header format (old column names, pre-custom-columns era)
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
// Default custom columns written to a brand-new empty sheet
const DEFAULT_CUSTOM_COLUMNS = ["SpentFor", "Channel", "Theme"];
// Reserved column names (case-insensitive) that cannot be used for custom columns
const RESERVED_COLUMN_NAMES = new Set(["date", "usd", "category", "spentby", "comment"]);
const MAX_DATASET_BYTES = 10 * 1024 * 1024;
const MAX_CUSTOM_COLUMNS = 10;

function buildExpenseHeaders(sheetCurrencies, customColumns = []) {
  return ["Date", ...sheetCurrencies, ...POST_CURRENCY_FIXED, ...customColumns];
}

/**
 * Parse the header row into { currencies, customColumns }.
 * currencies = codes between Date and USD.
 * customColumns = names after Comment (case-insensitive anchor).
 * Returns null if the fixed structure (Date ... USD Category SpentBy ... Comment) is not found.
 * Comment is located by search, not fixed offset, so custom columns may appear before or after it.
 */
function parseSheetStructure(headerRow) {
  const normalized = normalizeHeaders(headerRow);
  if (normalized[0]?.toLowerCase() !== "date") return null;

  const usdIdx = normalized.findIndex((h) => h.toLowerCase() === "usd");
  if (usdIdx < 1) return null;

  const categoryIdx = usdIdx + 1;
  const spentByIdx = usdIdx + 2;

  if (
    normalized[categoryIdx]?.toLowerCase() !== "category" ||
    normalized[spentByIdx]?.toLowerCase() !== "spentby"
  ) {
    return null;
  }

  // Comment may not be immediately after SpentBy (e.g. custom columns inserted before it)
  const commentIdx = normalized.findIndex(
    (h, i) => i > spentByIdx && h.toLowerCase() === "comment",
  );
  if (commentIdx === -1) return null;

  const currencies = normalized.slice(1, usdIdx);
  // Columns between SpentBy and Comment + columns after Comment are all custom columns
  const customColumns = [
    ...normalized.slice(spentByIdx + 1, commentIdx),
    ...normalized.slice(commentIdx + 1),
  ];
  return { currencies, customColumns };
}

function normalizeHeaders(row = []) {
  return row.map((value) => value.trim());
}

/**
 * Returns a human-readable explanation of why a header row failed to parse.
 */
function diagnoseSheetStructure(normalized) {
  if (!normalized || normalized.length === 0) return "The header row is empty.";
  if (normalized[0]?.toLowerCase() !== "date") return `First column must be "Date" but found "${normalized[0]}".`;
  const usdIdx = normalized.findIndex((h) => h.toLowerCase() === "usd");
  if (usdIdx < 1) return "Column \"USD\" was not found in the header row.";
  if (normalized[usdIdx + 1]?.toLowerCase() !== "category")
    return `Expected "Category" after "USD" but found "${normalized[usdIdx + 1] ?? "(missing)"}".`;
  if (normalized[usdIdx + 2]?.toLowerCase() !== "spentby")
    return `Expected "SpentBy" after "Category" but found "${normalized[usdIdx + 2] ?? "(missing)"}".`;
  const spentByIdx = usdIdx + 2;
  const hasComment = normalized.some((h, i) => i > spentByIdx && h.toLowerCase() === "comment");
  if (!hasComment) return "Column \"Comment\" was not found after \"SpentBy\".";
  return "Unrecognized structure.";
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

/**
 * Validate column name against naming rules.
 * Returns an error message string, or null if valid.
 */
export function validateColumnName(name, existingNames = [], excludeName = null) {
  if (!name || !name.trim()) return "Column name cannot be empty.";
  const trimmed = name.trim();
  if (trimmed.length > 30) return "Column name must be 30 characters or less.";
  if (RESERVED_COLUMN_NAMES.has(trimmed.toLowerCase())) return `"${trimmed}" is a reserved column name.`;
  const lowerNew = trimmed.toLowerCase();
  const duplicate = existingNames.some(
    (n) => n.toLowerCase() === lowerNew && n.toLowerCase() !== excludeName?.toLowerCase(),
  );
  if (duplicate) return `A column named "${trimmed}" already exists.`;
  return null;
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

function remapLegacyRowToCurrent(row = [], customColumnCount) {
  // Legacy: Date,PLN,BYN,USD,EUR,Category,WhoSpent,ForWhom,Comment,PaymentChannel,Theme
  // New:    Date,PLN,BYN,EUR,USD,Category,SpentBy,Comment,[custom...]
  const padded = [...row];
  while (padded.length < LEGACY_EXPENSE_HEADERS.length) {
    padded.push("");
  }
  const base = [
    padded[0] ?? "", // Date
    padded[1] ?? "", // PLN
    padded[2] ?? "", // BYN
    padded[4] ?? "", // EUR (was at index 4)
    padded[3] ?? "", // USD (was at index 3)
    padded[5] ?? "", // Category
    padded[6] ?? "", // SpentBy (was WhoSpent)
    padded[8] ?? "", // Comment (was at index 8)
  ];
  // Custom columns: map ForWhom→SpentFor, PaymentChannel→Channel, Theme→Theme
  // ForWhom=7, PaymentChannel=9, Theme=10
  if (customColumnCount > 0) base.push(padded[7] ?? ""); // SpentFor
  if (customColumnCount > 1) base.push(padded[9] ?? ""); // Channel
  if (customColumnCount > 2) base.push(padded[10] ?? ""); // Theme
  return base;
}

async function migrateLegacyColumnOrder(accessToken, spreadsheetId, customColumns = []) {
  const currentHeaders = buildExpenseHeaders(["PLN", "BYN", "EUR"], customColumns);
  const allRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:K`);
  const migratedRows = allRows.map((row, index) =>
    index === 0 ? currentHeaders : remapLegacyRowToCurrent(row, customColumns.length),
  );

  const endCol = columnLetter(currentHeaders.length);
  await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}${migratedRows.length}`, migratedRows);
}

/**
 * Map raw sheet rows to expense records using the actual full header array.
 * Column positions are derived from the actual header row so that custom columns
 * inserted before Comment (legacy sheets) are mapped correctly.
 */
function mapRowsToExpenseRecords(rows, sheetCurrencies, customColumns = [], actualHeaderRow = []) {
  const postStart = 1 + sheetCurrencies.length; // assumed index of USD (fallback)

  // Build a lookup: lowercase column name → actual column index
  const headerMap = new Map();
  normalizeHeaders(actualHeaderRow).forEach((h, i) => headerMap.set(h.toLowerCase(), i));

  const getIdx = (name, fallback) => {
    const idx = headerMap.get(name.toLowerCase());
    return idx !== undefined ? idx : fallback;
  };

  const usdIdx      = getIdx("usd",      postStart);
  const categoryIdx = getIdx("category", postStart + 1);
  const spentByIdx  = getIdx("spentby",  postStart + 2);
  const commentIdx  = getIdx("comment",  postStart + 3);

  const paddingTarget = actualHeaderRow.length > 0
    ? actualHeaderRow.length
    : postStart + 4 + customColumns.length;

  return rows.map((row, index) => {
    const padded = [...row];
    while (padded.length < paddingTarget) {
      padded.push("");
    }

    const currencyAmounts = {};
    for (let i = 0; i < sheetCurrencies.length; i++) {
      currencyAmounts[sheetCurrencies[i]] = padded[1 + i] ?? "";
    }

    const customFields = {};
    for (const colName of customColumns) {
      const colIdx = getIdx(colName, null);
      if (colIdx !== null) {
        customFields[colName] = padded[colIdx] ?? "";
      }
    }

    return {
      Date: padded[0] ?? "",
      currencyAmounts,
      USD: padded[usdIdx] ?? "",
      Category: padded[categoryIdx] ?? "",
      SpentBy: padded[spentByIdx] ?? "",
      Comment: padded[commentIdx] ?? "",
      customFields,
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

export async function validateSpreadsheet(accessToken, spreadsheetId, activeCurrencies = [], activeCustomColumns = []) {
  const report = { tabAction: "found", headersAction: "valid", sheetCurrencies: [], customColumns: [] };

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
    // New empty sheet: write default custom columns
    const customCols = activeCustomColumns.length > 0 ? activeCustomColumns : DEFAULT_CUSTOM_COLUMNS;
    const headers = buildExpenseHeaders(activeCurrencies, customCols);
    const endCol = columnLetter(headers.length);
    await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [headers]);
    report.headersAction = "created";
    report.sheetCurrencies = [...activeCurrencies];
    report.customColumns = customCols;
    return report;
  }

  if (validateLegacyHeaderRow(headerRow)) {
    const customCols = activeCustomColumns.length > 0 ? activeCustomColumns : DEFAULT_CUSTOM_COLUMNS;
    await migrateLegacyColumnOrder(accessToken, spreadsheetId, customCols);
    report.headersAction = "migrated";
    report.sheetCurrencies = ["PLN", "BYN", "EUR"];
    report.customColumns = customCols;
    return report;
  }

  // Try to parse dynamic header structure
  const structure = parseSheetStructure(headerRow);
  if (structure === null) {
    const sampleCustom = activeCustomColumns.length > 0 ? activeCustomColumns : DEFAULT_CUSTOM_COLUMNS;
    const expectedSample = buildExpenseHeaders(
      activeCurrencies.length > 0 ? activeCurrencies : ["(your currencies)"],
      sampleCustom,
    );
    const error = new Error(
      `The "${SHEET_NAME}" sheet header must start with "Date", have currency columns, then "USD, Category, SpentBy, Comment", followed by any custom columns.`,
    );
    error.headerDetails = {
      expected: expectedSample,
      actual: normalizeHeaders(headerRow),
    };
    throw error;
  }

  report.sheetCurrencies = structure.currencies;
  report.customColumns = structure.customColumns;
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

  const structure = parseSheetStructure(headerRow);
  if (structure === null) {
    const actual = normalizeHeaders(headerRow);
    const reason = diagnoseSheetStructure(actual);
    const error = new Error(`Cannot modify currencies: sheet header structure is unrecognized. ${reason}`);
    error.headerDetails = { actual };
    throw error;
  }
  const existingCurrencies = structure.currencies;
  const existingCustomColumns = structure.customColumns;

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
    const headers = buildExpenseHeaders(newSheetCurrencies, existingCustomColumns);
    const endCol = columnLetter(headers.length);
    await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [headers]);
    return { sheetCurrencies: newSheetCurrencies };
  }

  // Insert columns before USD (which is at index 1 + existingCurrencies.length)
  const usdColumnIndex = 1 + existingCurrencies.length;

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

  const newSheetCurrencies = [...existingCurrencies, ...toAdd];
  const newHeaders = buildExpenseHeaders(newSheetCurrencies, existingCustomColumns);
  const endCol = columnLetter(newHeaders.length);
  await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [newHeaders]);

  return { sheetCurrencies: newSheetCurrencies };
}

/** Insert a new custom column at the end of the sheet header. Returns the column index (1-based). */
export async function insertCustomColumnInSheet(accessToken, spreadsheetId, columnName) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (!expenseSheet) throw new Error("Expenses sheet not found.");

  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const headerRow = normalizeHeaders(headerRows[0] ?? []);
  const newColIndex = headerRow.length; // 0-based index for insertion

  const allRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:A`);
  if (allRows.length > 1) {
    // Sheet has data — insert a new dimension
    const sheetId = expenseSheet.properties.sheetId;
    await requestJson(
      accessToken,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: createHeaders(accessToken, true),
        body: JSON.stringify({
          requests: [{
            insertDimension: {
              range: { sheetId, dimension: "COLUMNS", startIndex: newColIndex, endIndex: newColIndex + 1 },
              inheritFromBefore: false,
            },
          }],
        }),
      },
    );
  }

  const newColLetter = columnLetter(newColIndex + 1);
  await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!${newColLetter}1`, [[columnName]]);
  return newColIndex + 1; // 1-based
}

/** Rename a column header cell by 1-based column index. */
export async function renameColumnInSheet(accessToken, spreadsheetId, colIndex1Based, newName) {
  const colLetter = columnLetter(colIndex1Based);
  await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!${colLetter}1`, [[newName]]);
}

/**
 * Reorder custom columns in the sheet to match the given ordered list of names.
 * Reads the current header, finds current positions, issues moveDimension requests.
 */
export async function reorderCustomColumnsInSheet(accessToken, spreadsheetId, orderedNames) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (!expenseSheet) throw new Error("Expenses sheet not found.");
  const sheetId = expenseSheet.properties.sheetId;

  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const headerRow = normalizeHeaders(headerRows[0] ?? []);

  const structure = parseSheetStructure(headerRow);
  if (!structure) throw new Error("Cannot reorder: sheet header structure is unrecognized.");

  const customStartIdx = headerRow.length - structure.customColumns.length; // 0-based

  // Build moves using selection-sort logic to avoid index shifting issues.
  // Each iteration: find where desired[i] currently is, move it to position customStartIdx+i.
  const working = [...headerRow];
  const requests = [];

  for (let i = 0; i < orderedNames.length; i++) {
    const targetIdx = customStartIdx + i;
    const currentIdx = working.findIndex(
      (h, j) => j >= targetIdx && h.toLowerCase() === orderedNames[i].toLowerCase(),
    );
    if (currentIdx === -1 || currentIdx === targetIdx) continue;

    requests.push({
      moveDimension: {
        source: { sheetId, dimension: "COLUMNS", startIndex: currentIdx, endIndex: currentIdx + 1 },
        destinationIndex: targetIdx,
      },
    });

    // Update working array to reflect the move
    const [moved] = working.splice(currentIdx, 1);
    working.splice(targetIdx, 0, moved);
  }

  if (requests.length === 0) return;

  await requestJson(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({ requests }),
    },
  );
}

/**
 * Check if a column (1-based index) has any data below the header row.
 * Returns true if all cells below row 1 are empty.
 */
export async function isCustomColumnEmpty(accessToken, spreadsheetId, colIndex1Based) {
  const colLetter = columnLetter(colIndex1Based);
  const range = `${SHEET_NAME}!${colLetter}2:${colLetter}`;
  const rows = await getValues(accessToken, spreadsheetId, range);
  return rows.length === 0 || rows.every((row) => !row[0]?.trim());
}

/** Hard-delete a column (1-based index) from the sheet. */
export async function deleteColumnFromSheet(accessToken, spreadsheetId, colIndex1Based) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (!expenseSheet) throw new Error("Expenses sheet not found.");
  const sheetId = expenseSheet.properties.sheetId;
  const idx0 = colIndex1Based - 1;
  await requestJson(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "COLUMNS", startIndex: idx0, endIndex: idx0 + 1 },
          },
        }],
      }),
    },
  );
}

/** Find the 1-based column index of a named column in the sheet header (case-insensitive). */
export async function findColumnIndex(accessToken, spreadsheetId, columnName) {
  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const headerRow = normalizeHeaders(headerRows[0] ?? []);
  const idx = headerRow.findIndex((h) => h.toLowerCase() === columnName.toLowerCase());
  return idx === -1 ? null : idx + 1;
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

export async function loadExpenses(accessToken, spreadsheetId, activeCustomColumns = []) {
  const report = await validateSpreadsheet(accessToken, spreadsheetId, [], activeCustomColumns);
  const sheetCurrencies = report.sheetCurrencies;
  const customColumns = report.customColumns;
  const headers = buildExpenseHeaders(sheetCurrencies, customColumns);
  const endCol = columnLetter(headers.length);
  const rows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:${endCol}`);
  const records = mapRowsToExpenseRecords(rows.slice(1), sheetCurrencies, customColumns, rows[0]);
  const payloadBytes = calculateJsonByteSize(records);

  if (payloadBytes > MAX_DATASET_BYTES) {
    throw new Error("Spreadsheet data is too large for Tail/Search. The JSON payload exceeds 10 MB.");
  }

  return {
    records,
    payloadBytes,
    sheetCurrencies,
    customColumns,
  };
}

export async function appendExpenseRow(accessToken, spreadsheetId, values, activeCustomColumns = []) {
  const report = await validateSpreadsheet(accessToken, spreadsheetId, [], activeCustomColumns);
  const headers = buildExpenseHeaders(report.sheetCurrencies, report.customColumns);
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

export { VALID_CURRENCY_CODES, SHEET_NAME, DEFAULT_CUSTOM_COLUMNS, MAX_CUSTOM_COLUMNS };
