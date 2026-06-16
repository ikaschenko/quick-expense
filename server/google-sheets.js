import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getServiceAccountAccessToken, SERVICE_ACCOUNT_EMAIL } from "./google-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const currencyDictionary = JSON.parse(
  readFileSync(join(__dirname, "..", "config", "currencies.json"), "utf-8"),
);
const VALID_CURRENCY_CODES = new Set(currencyDictionary.currencies.map((c) => c.code));

const SHEET_NAME = "Expenses";
const TEMPLATE_SPREADSHEET_ID = "1uE3OmvxHg03aETXg0msInAVniWZfoadwdpxf1gR2ENg";
// Fixed columns that always appear after the currency block, in this exact order.
const POST_CURRENCY_FIXED = ["USD", "Category", "Spent By", "Comment"];
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
const RESERVED_COLUMN_NAMES = new Set(["date", "usd", "category", "spent by", "comment"]);
const MAX_DATASET_BYTES = 10 * 1024 * 1024;
const MAX_CUSTOM_COLUMNS = 10;
const MAX_OPTIONAL_CURRENCIES = 10;

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
    normalized[spentByIdx]?.toLowerCase() !== "spent by"
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
  const normalized = row.map((value) => String(value ?? "").trim());
  while (normalized.length > 0 && normalized[normalized.length - 1] === "") {
    normalized.pop();
  }
  return normalized;
}

function parseEffectiveSheetStructure(headerRow, mapping = null) {
  const normalizedHeader = normalizeHeaders(headerRow);
  const effectiveHeader = mapping ? applyMappingToHeader(normalizedHeader, mapping) : normalizedHeader;
  const structure = parseSheetStructure(effectiveHeader);
  return { normalizedHeader, effectiveHeader, structure };
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
  if (normalized[usdIdx + 2]?.toLowerCase() !== "spent by")
    return `Expected "Spent By" after "Category" but found "${normalized[usdIdx + 2] ?? "(missing)"}"`;  
  const spentByIdx = usdIdx + 2;
  const hasComment = normalized.some((h, i) => i > spentByIdx && h.toLowerCase() === "comment");
  if (!hasComment) return "Column \"Comment\" was not found after \"Spent By\".";
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

export function hasExactItemSet(expectedItems = [], actualItems = []) {
  if (expectedItems.length !== actualItems.length) return false;

  const normalize = (value) => value.trim().toLowerCase();
  const expectedSet = new Set(expectedItems.map(normalize));
  const actualSet = new Set(actualItems.map(normalize));

  if (expectedSet.size !== expectedItems.length || actualSet.size !== actualItems.length) {
    return false;
  }

  if (expectedSet.size !== actualSet.size) return false;

  for (const value of expectedSet) {
    if (!actualSet.has(value)) return false;
  }

  return true;
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
  // New:    Date,PLN,BYN,EUR,USD,Category,Spent By,Comment,[custom...]
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
 * When a mapping is provided, QE field name lookups are aliased to the user's
 * actual column names so returned records always use QE field names.
 */
function mapRowsToExpenseRecords(rows, sheetCurrencies, customColumns = [], actualHeaderRow = [], mapping = null, rowOffset = 0) {
  const postStart = 1 + sheetCurrencies.length; // assumed index of USD (fallback)

  // Build a lookup: lowercase column name → actual column index
  const headerMap = new Map();
  normalizeHeaders(actualHeaderRow).forEach((h, i) => headerMap.set(h.toLowerCase(), i));

  // Add mapping aliases: QE field name (lowercase) → index of user's actual column
  if (mapping) {
    for (const [qeField, userCol] of Object.entries(mapping)) {
      const idx = headerMap.get(userCol.toLowerCase());
      if (idx !== undefined) {
        headerMap.set(qeField.toLowerCase(), idx);
      }
    }
  }

  const getIdx = (name, fallback) => {
    const idx = headerMap.get(name.toLowerCase());
    return idx !== undefined ? idx : fallback;
  };

  const usdIdx      = getIdx("usd",      postStart);
  const categoryIdx = getIdx("category", postStart + 1);
  const spentByIdx  = getIdx("spent by",  postStart + 2);
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
      "spentBy": padded[spentByIdx] ?? "",
      Comment: padded[commentIdx] ?? "",
      customFields,
      rowNumber: index + 2 + rowOffset,
    };
  });
}

function calculateJsonByteSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const MIN_HISTORY_ROWS = 20;

/**
 * Parse a date string from a Google Sheet cell into epoch milliseconds (UTC midnight).
 * Supports: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, DD.MM.YYYY, MM.DD.YYYY.
 * Returns null when the string cannot be parsed.
 * Requires a pre-built formatParser from buildDateParser(); the parser encodes the
 * detected field order so this function stays O(1) per call.
 */
export function parseDateToMs(dateStr, formatParser) {
  if (!dateStr || typeof dateStr !== "string") return null;
  if (!formatParser) return null;
  return formatParser(dateStr);
}

/**
 * Build a date-format parser by sampling up to 30 non-empty date strings.
 * Returns a function (dateStr) => epoch-ms | null, or null when the format
 * cannot be determined from the samples.
 *
 * Detection rules (applied in order):
 *   1. If any part[0] > 12 across samples → DD/sep/MM/sep/YYYY
 *   2. If any part[1] > 12 across samples → MM/sep/DD/sep/YYYY
 *   3. Default assumption: MM/sep/DD/sep/YYYY
 *
 * YYYY-MM-DD is detected by the 4-digit leading part and handled separately.
 */
export function buildDateParser(dateSamples) {
  // Fast path: ISO format (YYYY-MM-DD)
  const isoSample = dateSamples.find((s) => s && /^\d{4}-\d{2}-\d{2}$/.test(s));
  if (isoSample) {
    return (s) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      const ms = Date.parse(s);
      return isNaN(ms) ? null : ms;
    };
  }

  // Detect separator and field order from non-ISO samples
  let sep = null;
  let dayFirst = null;

  const nonEmpty = dateSamples.filter(Boolean).slice(0, 30);
  for (const sample of nonEmpty) {
    const foundSep = ["/", "."].find((c) => sample.split(c).length === 3);
    if (!foundSep) continue;
    if (sep === null) sep = foundSep;
    else if (foundSep !== sep) continue;

    const parts = sample.split(foundSep);
    if (parts.some((p) => !/^\d+$/.test(p))) continue;
    // Identify year part (4 digits)
    const yIdx = parts.findIndex((p) => p.length === 4);
    if (yIdx !== 2) continue; // year must be last for MM/DD/YYYY or DD/MM/YYYY
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (a > 12) { dayFirst = true; break; }
    if (b > 12) { dayFirst = false; break; }
  }

  if (sep === null) return null; // unrecognisable format
  const isoDayFirst = dayFirst ?? false; // default: month first

  return (s) => {
    if (!s) return null;
    const parts = s.split(sep);
    if (parts.length !== 3) return null;
    const [p0, p1, p2] = parts;
    if (p2.length !== 4) return null;
    const year = parseInt(p2, 10);
    const month = isoDayFirst ? parseInt(p1, 10) : parseInt(p0, 10);
    const day   = isoDayFirst ? parseInt(p0, 10) : parseInt(p1, 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return Date.UTC(year, month - 1, day);
  };
}

/**
 * Check whether the given date values array is in non-decreasing chronological order.
 * Returns an array of 1-based sheet row numbers (up to 3) of rows whose date is
 * earlier than the preceding non-empty date — i.e. the out-of-order entries.
 * Returns an empty array when the dates are perfectly ordered.
 * Skips unparseable values (they do not trigger a violation).
 * dateValues[i] corresponds to sheet row i + 2 (header is row 1).
 */
function detectDateOrderIssue(dateValues, parser) {
  const violatingRows = [];
  let prevMs = null;
  for (let i = 0; i < dateValues.length; i++) {
    const ms = parseDateToMs(dateValues[i], parser);
    if (ms === null) continue;
    if (prevMs !== null && ms < prevMs) {
      violatingRows.push(i + 2); // i+2: 1-based sheet row (header=1, first data=2)
      if (violatingRows.length >= 3) break;
    }
    prevMs = ms;
  }
  return violatingRows;
}

/**
 * Binary-search the date column of the Expenses sheet to find the first spreadsheet row
 * whose date is >= (today − recentMonths months).
 *
 * Returns { startRow, totalRows, isSplit, dateOrderIssueRows }:
 *   startRow            — 1-based spreadsheet row of the first "recent" record (≥ 2).
 *   totalRows           — total data rows (excluding header).
 *   isSplit             — true when a meaningful split was found (enough historical rows to justify it).
 *   dateOrderIssueRows  — 1-based sheet row numbers (up to 3) of out-of-order entries; empty when ordered.
 *
 * Falls back to { startRow: 2, totalRows, isSplit: false, dateOrderIssueRows: [] } when:
 *   - All data is within the recent window (no historical rows).
 *   - Fewer than MIN_HISTORY_ROWS historical rows (split overhead not worth it).
 *   - Date format is unrecognizable.
 *   - Any unexpected error.
 */
export async function findExpenseStartRow(accessToken, spreadsheetId, recentMonths) {
  const dateRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:A`);
  const totalRows = Math.max(0, dateRows.length - 1); // exclude header

  if (totalRows === 0) return { startRow: 2, totalRows: 0, isSplit: false, dateOrderIssueRows: [] };

  const dateValues = dateRows.slice(1).map((r) => r[0] ?? "");
  const parser = buildDateParser(dateValues.filter(Boolean).slice(0, 30));
  if (!parser) return { startRow: 2, totalRows, isSplit: false, dateOrderIssueRows: [] };

  const dateOrderIssueRows = detectDateOrderIssue(dateValues, parser);

  const now = new Date();
  // Subtract recentMonths: JS Date handles month underflow correctly
  const cutoffMs = Date.UTC(
    new Date(now.getFullYear(), now.getMonth() - recentMonths, 1).getFullYear(),
    new Date(now.getFullYear(), now.getMonth() - recentMonths, 1).getMonth(),
    1,
  );

  // Binary search for first index i where date >= cutoffMs
  let lo = 0;
  let hi = dateValues.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const ms = parseDateToMs(dateValues[mid], parser);
    if (ms === null || ms < cutoffMs) lo = mid + 1;
    else hi = mid;
  }

  const historicalRows = lo;
  if (historicalRows < MIN_HISTORY_ROWS) return { startRow: 2, totalRows, isSplit: false, dateOrderIssueRows };

  // startRow: lo is 0-based index in dateValues; spreadsheet row = lo + 2 (header=1, data starts at 2)
  return { startRow: lo + 2, totalRows, isSplit: true, dateOrderIssueRows };
}

/**
 * Fetch QuickExpense template sheet list and named ranges (publicly shared, no OAuth required).
 * Lightweight request — no grid data, just the metadata needed for the copyTo flow.
 */
async function fetchTemplateSheets() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured.");
  const fields = encodeURIComponent("sheets.properties(sheetId,title),namedRanges(name,range)");
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${TEMPLATE_SPREADSHEET_ID}?fields=${fields}&key=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Failed to fetch template: ${body.error?.message ?? response.status}`);
  }
  return response.json();
}

export async function createSpreadsheet(accessToken, title) {
  // Step 1 [parallel]: SA token + template sheet metadata + blank spreadsheet
  const [saToken, templateSheets, created] = await Promise.all([
    getServiceAccountAccessToken(),
    fetchTemplateSheets(),
    requestJson(accessToken, "https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({ properties: { title } }),
    }),
  ]);

  const spreadsheetId = created.spreadsheetId;
  const defaultSheetId = created.sheets?.[0]?.properties?.sheetId ?? 0;
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;

  // Step 2: grant SA editor access to the new spreadsheet so copyTo can write into it
  const permission = await requestJson(accessToken, `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions`, {
    method: "POST",
    headers: createHeaders(accessToken, true),
    body: JSON.stringify({ role: "writer", type: "user", emailAddress: SERVICE_ACCOUNT_EMAIL }),
  });
  const permissionId = permission.id;

  try {
    // Step 3: copy each template sheet into the new spreadsheet (SA token)
    // copyTo preserves all cell data, formatting, banding, filters, and validation.
    const copyResults = [];
    for (const sheet of templateSheets.sheets) {
      const result = await requestJson(saToken, `https://sheets.googleapis.com/v4/spreadsheets/${TEMPLATE_SPREADSHEET_ID}/sheets/${sheet.properties.sheetId}:copyTo`, {
        method: "POST",
        headers: createHeaders(saToken, true),
        body: JSON.stringify({ destinationSpreadsheetId: spreadsheetId }),
      });
      copyResults.push({ originalSheetId: sheet.properties.sheetId, title: sheet.properties.title, newSheetId: result.sheetId });
    }

    // Step 4: rename "Copy of X" → "X" + delete the default blank sheet (SA token)
    await requestJson(saToken, batchUrl, {
      method: "POST",
      headers: createHeaders(saToken, true),
      body: JSON.stringify({
        requests: [
          ...copyResults.map(({ title: sheetTitle, newSheetId }) => ({
            updateSheetProperties: {
              properties: { sheetId: newSheetId, title: sheetTitle },
              fields: "title",
            },
          })),
          { deleteSheet: { sheetId: defaultSheetId } },
        ],
      }),
    });

    // Step 5: copy spreadsheet-level named ranges (not transferred by copyTo)
    const namedRanges = templateSheets.namedRanges ?? [];
    if (namedRanges.length > 0) {
      const sheetIdMap = new Map(copyResults.map(({ originalSheetId, newSheetId }) => [originalSheetId, newSheetId]));
      await requestJson(saToken, batchUrl, {
        method: "POST",
        headers: createHeaders(saToken, true),
        body: JSON.stringify({
          requests: namedRanges.map((nr) => ({
            addNamedRange: {
              namedRange: {
                name: nr.name,
                range: { ...nr.range, sheetId: sheetIdMap.get(nr.range.sheetId) ?? nr.range.sheetId },
              },
            },
          })),
        }),
      });
    }
  } catch (err) {
    const error = new Error("Could not copy the template spreadsheet. Please make a copy manually.");
    error.templateCopyFailed = true;
    error.templateUrl = `https://docs.google.com/spreadsheets/d/${TEMPLATE_SPREADSHEET_ID}/copy`;
    throw error;
  } finally {
    // Step 6: remove SA editor permission (best-effort cleanup)
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/permissions/${permissionId}`,
      { method: "DELETE", headers: createHeaders(accessToken) },
    ).catch(() => {});
  }

  return { spreadsheetId, spreadsheetUrl };
}


export function parseSpreadsheetUrl(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

/**
 * Fetch the Drive display name for a spreadsheet file.
 * Requires the file to have been opened or created by this app (drive.file scope).
 * Returns { fileName } or throws on API error.
 */
export async function getSpreadsheetFileMeta(accessToken, spreadsheetId) {
  const data = await requestJson(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=name`,
    { headers: createHeaders(accessToken) },
  );
  return { fileName: data.name ?? null };
}

/**
 * Count data rows in the Expenses sheet (excluding the header row).
 * Returns 0 if the sheet has no rows, no header, or does not exist yet.
 */
export async function getExpenseRowCount(accessToken, spreadsheetId) {
  try {
    const rows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:A`);
    return Math.max(0, rows.length - 1);
  } catch {
    return 0;
  }
}

/**
 * Apply a column mapping (QE field → user column name) to a normalized header row.
 * Replaces each user column name with its QE field equivalent where a mapping entry exists.
 * Columns not in the mapping are returned unchanged.
 */
function applyMappingToHeader(normalizedHeader, mapping) {
  const inverseMapping = new Map();
  for (const [qeField, userCol] of Object.entries(mapping)) {
    inverseMapping.set(userCol.toLowerCase(), qeField);
  }
  return normalizedHeader.map((h) => inverseMapping.get(h.toLowerCase()) ?? h);
}

/**
 * Read the column mapping from the Config sheet.
 * Returns:
 * Detect the Config sheet and determine the configuration mode.
 * Returns one of:
 *   { mode: "default",          predefinedCategories: [] }              — no Config sheet found
 *   { mode: "config-no-mapping", predefinedCategories: string[] }       — Config sheet with no column_mapping
 *   { mode: "config-driven",    predefinedCategories: string[], mapping: {...} } — valid mapping present
 *   { mode: "config-invalid",   predefinedCategories: string[], reason: "..." } — column_mapping is malformed
 * schema_version rows are silently ignored (backward compatibility).
 * Never throws — callers receive a safe fallback result on any error.
 */
export async function detectConfigSheet(accessToken, spreadsheetId) {
  try {
    const metadata = await getMetadata(accessToken, spreadsheetId);
    const configSheet = metadata.sheets?.find((s) => s.properties?.title === "Config");
    if (!configSheet) return { mode: "default", predefinedCategories: [], metadata };

    const rows = await getValues(accessToken, spreadsheetId, "Config!A:B");

    // Parse categories_list block: the key row marks the start; its column B is a human label (skipped).
    // Subsequent rows with empty column A and non-empty column B are category values.
    // The block ends at the next row with a non-empty column A.
    const predefinedCategories = [];
    const catStartIdx = rows.findIndex((r) => r[0] === "categories_list");
    if (catStartIdx !== -1) {
      for (let i = catStartIdx + 1; i < rows.length; i++) {
        if (rows[i][0]) break;
        const val = rows[i][1]?.trim();
        if (val) predefinedCategories.push(val);
      }
    }

    // Parse column_mapping — absence is not an error.
    const mappingRow = rows.find((r) => r[0] === "column_mapping");
    if (!mappingRow || !mappingRow[1]) {
      return { mode: "config-no-mapping", predefinedCategories, metadata };
    }

    try {
      const parsed = JSON.parse(mappingRow[1]);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { mode: "config-invalid", reason: "column_mapping is not a valid JSON object.", predefinedCategories, metadata };
      }
      return { mode: "config-driven", mapping: parsed, predefinedCategories, metadata };
    } catch {
      return { mode: "config-invalid", reason: "column_mapping contains invalid JSON.", predefinedCategories, metadata };
    }
  } catch {
    return { mode: "default", predefinedCategories: [], metadata: null };
  }
}

/**
 * Write the column mapping to the Config sheet.
 * Creates the Config sheet if it does not exist (the one and only place it is created).
 * If the sheet already exists, updates the column_mapping row in place or appends it
 * after the last data row — preserving any existing categories_list block.
 */
export async function writeConfigSheetMapping(accessToken, spreadsheetId, mapping) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const configSheet = metadata.sheets?.find((s) => s.properties?.title === "Config");
  if (!configSheet) {
    await addSheet(accessToken, spreadsheetId, "Config");
    await updateValues(accessToken, spreadsheetId, "Config!A1:B1", [
      ["column_mapping", JSON.stringify(mapping)],
    ]);
    return;
  }

  const rows = await getValues(accessToken, spreadsheetId, "Config!A:B");
  const mappingRowIdx = rows.findIndex((r) => r[0] === "column_mapping");
  const rowNumber = mappingRowIdx !== -1 ? mappingRowIdx + 1 : rows.length + 1;
  await updateValues(accessToken, spreadsheetId, `Config!A${rowNumber}:B${rowNumber}`, [
    ["column_mapping", JSON.stringify(mapping)],
  ]);
}

/**
 * Read the first row of the Expenses sheet and return column names as a string[].
 * Returns an empty array if the sheet or header row does not exist.
 * Never throws — callers receive an empty array on any error.
 */
export async function readExpensesSheetHeader(accessToken, spreadsheetId) {
  try {
    const rows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
    return rows[0] ?? [];
  } catch {
    return [];
  }
}

export async function validateSpreadsheet(accessToken, spreadsheetId, mapping = null, cachedMetadata = null) {
  const report = { tabAction: "found", headersAction: "valid", sheetCurrencies: [], customColumns: [], headerRow: [] };

  const metadata = cachedMetadata ?? await getMetadata(accessToken, spreadsheetId);
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
    if (mapping) {
      // With a mapping in place the Expenses tab must already have column headers.
      const error = new Error(
        `The "${SHEET_NAME}" tab header row is empty. Cannot apply column mapping to a sheet without headers.`,
      );
      error.headerDetails = {
        expected: ["Date", "(currencies...)", "USD", "Category", "Spent By", "Comment", "(custom columns...)"],
        actual: [],
        detectedColumns: [],
      };
      throw error;
    }
    // New empty sheet: write default headers
    const headers = buildExpenseHeaders([], DEFAULT_CUSTOM_COLUMNS);
    const endCol = columnLetter(headers.length);
    await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [headers]);
    report.headersAction = "created";
    report.sheetCurrencies = [];
    report.customColumns = [...DEFAULT_CUSTOM_COLUMNS];
    report.headerRow = headers;
    return report;
  }

  if (!mapping && validateLegacyHeaderRow(headerRow)) {
    const customCols = DEFAULT_CUSTOM_COLUMNS;
    await migrateLegacyColumnOrder(accessToken, spreadsheetId, customCols);
    report.headersAction = "migrated";
    report.sheetCurrencies = ["PLN", "BYN", "EUR"];
    report.customColumns = customCols;
    report.headerRow = buildExpenseHeaders(["PLN", "BYN", "EUR"], customCols);
    return report;
  }

  const normalizedHeader = normalizeHeaders(headerRow);
  // When a mapping is provided, translate user column names to QE field names before parsing.
  const effectiveHeader = mapping ? applyMappingToHeader(normalizedHeader, mapping) : normalizedHeader;

  // Try to parse dynamic header structure
  const structure = parseSheetStructure(effectiveHeader);
  if (structure === null) {
    const error = new Error(
      `The "${SHEET_NAME}" sheet header must start with "Date", have currency columns, then "USD, Category, Spent By, Comment", followed by any custom columns.`,
    );
    error.headerDetails = {
      expected: ["Date", "(currencies...)", "USD", "Category", "Spent By", "Comment", "(custom columns...)"],
      actual: normalizedHeader,
      detectedColumns: normalizedHeader,
    };
    throw error;
  }

  report.sheetCurrencies = structure.currencies;
  report.customColumns = structure.customColumns;
  report.headerRow = headerRow;
  return report;
}

/**
 * Insert a single optional currency column immediately before USD.
 * Validates: max 10 currencies, no duplicates.
 * Returns the updated structure { currencies, customColumns }.
 */
export async function insertCurrencyColumnInSheet(accessToken, spreadsheetId, currencyCode) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find(
    (sheet) => sheet.properties?.title === SHEET_NAME,
  );

  if (!expenseSheet) throw new Error("Expenses sheet not found.");

  const sheetId = expenseSheet.properties.sheetId;
  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const headerRow = headerRows[0];

  if (isHeaderRowEmpty(headerRow)) {
    const headers = buildExpenseHeaders([currencyCode], DEFAULT_CUSTOM_COLUMNS);
    const endCol = columnLetter(headers.length);
    await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [headers]);
    return { currencies: [currencyCode], customColumns: [...DEFAULT_CUSTOM_COLUMNS] };
  }

  const structure = parseSheetStructure(headerRow);
  if (structure === null) {
    const actual = normalizeHeaders(headerRow);
    const reason = diagnoseSheetStructure(actual);
    throw new Error(`Cannot add currency: sheet header structure is unrecognized. ${reason}`);
  }

  if (structure.currencies.length >= MAX_OPTIONAL_CURRENCIES) {
    throw new Error(`Cannot add more than ${MAX_OPTIONAL_CURRENCIES} optional currency columns.`);
  }

  const duplicate = structure.currencies.some(
    (c) => c.toLowerCase() === currencyCode.toLowerCase(),
  );
  if (duplicate) {
    throw new Error(`Currency "${currencyCode}" already exists in the sheet.`);
  }

  // Insert column before USD (which is at index 1 + existing currencies count)
  const usdColumnIndex = 1 + structure.currencies.length;

  const allRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:A`);
  if (allRows.length > 1) {
    // Sheet has data rows — insert a new dimension
    await requestJson(
      accessToken,
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: "POST",
        headers: createHeaders(accessToken, true),
        body: JSON.stringify({
          requests: [{
            insertDimension: {
              range: { sheetId, dimension: "COLUMNS", startIndex: usdColumnIndex, endIndex: usdColumnIndex + 1 },
              inheritFromBefore: false,
            },
          }],
        }),
      },
    );
  }

  // Write full header row with new currency
  const newCurrencies = [...structure.currencies, currencyCode];
  const newHeaders = buildExpenseHeaders(newCurrencies, structure.customColumns);
  const endCol = columnLetter(newHeaders.length);
  await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:${endCol}1`, [newHeaders]);

  return { currencies: newCurrencies, customColumns: structure.customColumns };
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
export async function reorderCustomColumnsInSheet(accessToken, spreadsheetId, orderedNames, mapping = null) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (!expenseSheet) throw new Error("Expenses sheet not found.");
  const sheetId = expenseSheet.properties.sheetId;

  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const { normalizedHeader, effectiveHeader, structure } = parseEffectiveSheetStructure(
    headerRows[0] ?? [],
    mapping,
  );

  if (!structure) {
    const reason = diagnoseSheetStructure(effectiveHeader);
    throw new Error(
      `Cannot reorder custom columns: ${reason} Expected header pattern: Date | [currencies] | USD | Category | Spent By | Comment | [custom columns].`,
    );
  }

  const customNameSet = new Set(structure.customColumns.map((name) => name.toLowerCase()));
  const customPositions = effectiveHeader
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => customNameSet.has(name.toLowerCase()))
    .map(({ index }) => index);

  if (customPositions.length !== orderedNames.length) {
    throw new Error("Cannot reorder custom columns: custom column count in header does not match the requested order.");
  }

  // Build moves using selection-sort logic to avoid index shifting issues.
  // Each iteration: find where desired[i] currently is, move it to the next custom slot.
  const workingRaw = [...normalizedHeader];
  const workingEffective = [...effectiveHeader];
  const requests = [];

  for (let i = 0; i < orderedNames.length; i++) {
    const targetIdx = customPositions[i];
    const currentIdx = workingEffective.findIndex(
      (h) => h.toLowerCase() === orderedNames[i].toLowerCase(),
    );
    if (currentIdx === -1) {
      throw new Error(
        `Cannot reorder custom columns: column "${orderedNames[i]}" was not found in the sheet header after applying mapping.`,
      );
    }
    if (currentIdx === targetIdx) continue;

    // The Sheets API destinationIndex is relative to the grid *before* the source column is
    // removed. Moving right (currentIdx < targetIdx): after removal indices shift left by 1,
    // so add 1 to land at the intended position. Moving left: no adjustment needed.
    const destinationIndex = currentIdx < targetIdx ? targetIdx + 1 : targetIdx;

    requests.push({
      moveDimension: {
        source: { sheetId, dimension: "COLUMNS", startIndex: currentIdx, endIndex: currentIdx + 1 },
        destinationIndex,
      },
    });

    // Update working arrays to reflect each move.
    const [movedRaw] = workingRaw.splice(currentIdx, 1);
    workingRaw.splice(targetIdx, 0, movedRaw);
    const [movedEffective] = workingEffective.splice(currentIdx, 1);
    workingEffective.splice(targetIdx, 0, movedEffective);
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
 * Reorder optional currency columns in the sheet to match the given ordered list of codes.
 * Currency columns live between Date (index 0) and USD.
 */
export async function reorderCurrencyColumnsInSheet(accessToken, spreadsheetId, orderedCodes, mapping = null) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (!expenseSheet) throw new Error("Expenses sheet not found.");
  const sheetId = expenseSheet.properties.sheetId;

  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const { effectiveHeader, structure } = parseEffectiveSheetStructure(headerRows[0] ?? [], mapping);

  if (!structure) {
    const reason = diagnoseSheetStructure(effectiveHeader);
    throw new Error(
      `Cannot reorder currency columns: ${reason} Expected header pattern: Date | [currencies] | USD | Category | Spent By | Comment | [custom columns].`,
    );
  }

  const currencyNameSet = new Set(structure.currencies.map((code) => code.toLowerCase()));
  const currencyPositions = effectiveHeader
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => currencyNameSet.has(name.toLowerCase()))
    .map(({ index }) => index);

  if (currencyPositions.length !== orderedCodes.length) {
    throw new Error("Cannot reorder currency columns: currency column count in header does not match the requested order.");
  }

  const working = [...effectiveHeader];
  const requests = [];

  for (let i = 0; i < orderedCodes.length; i++) {
    const targetIdx = currencyPositions[i];
    const currentIdx = working.findIndex(
      (h) => h.toLowerCase() === orderedCodes[i].toLowerCase(),
    );
    if (currentIdx === -1) {
      throw new Error(
        `Cannot reorder currency columns: column "${orderedCodes[i]}" was not found in the sheet header after applying mapping.`,
      );
    }
    if (currentIdx === targetIdx) continue;

    const destinationIndex = currentIdx < targetIdx ? targetIdx + 1 : targetIdx;

    requests.push({
      moveDimension: {
        source: { sheetId, dimension: "COLUMNS", startIndex: currentIdx, endIndex: currentIdx + 1 },
        destinationIndex,
      },
    });

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

/**
 * Delete the last data row from the Expenses sheet.
 * Performs a conflict check: if the sheet's actual data row count does not match
 * expectedDataRowCount, throws an error with code "CONFLICT" instead of deleting.
 */
export async function deleteLastExpenseRow(accessToken, spreadsheetId, expectedDataRowCount) {
  // Conflict check: count actual data rows (column A minus header)
  const colA = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:A`);
  const actualDataRowCount = Math.max(0, colA.length - 1);

  if (actualDataRowCount !== expectedDataRowCount) {
    const err = new Error("The sheet was updated since last load. Please reload before deleting.");
    err.code = "CONFLICT";
    throw err;
  }

  if (actualDataRowCount === 0) {
    throw new Error("No expense rows to delete.");
  }

  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (!expenseSheet) throw new Error("Expenses sheet not found.");
  const sheetId = expenseSheet.properties.sheetId;

  // Last data row: 0-based index = actualDataRowCount (header is index 0)
  const rowIdx0 = actualDataRowCount;
  await requestNoContent(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: rowIdx0, endIndex: rowIdx0 + 1 },
          },
        }],
      }),
    },
  );
}

/** Find the 1-based column index of a named column in the sheet header (case-insensitive). */
export async function findColumnIndex(accessToken, spreadsheetId, columnName, mapping = null) {
  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const { effectiveHeader } = parseEffectiveSheetStructure(headerRows[0] ?? [], mapping);
  const idx = effectiveHeader.findIndex((h) => h.toLowerCase() === columnName.toLowerCase());
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

export async function loadExpenses(accessToken, spreadsheetId, mapping = null, options = {}) {
  const { startRow = null, endRow = null, precomputedReport = null } = options;
  const report = precomputedReport ?? await validateSpreadsheet(accessToken, spreadsheetId, mapping);
  const { sheetCurrencies, customColumns } = report;
  const headers = buildExpenseHeaders(sheetCurrencies, customColumns);
  const endCol = columnLetter(headers.length);

  let rows;
  let actualHeaderRow;
  let rowOffset;

  if (startRow === null) {
    // Default path (full load, backward-compatible): fetch from A1 including header row
    rows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:${endCol}`);
    actualHeaderRow = rows[0];
    rows = rows.slice(1);
    rowOffset = 0;
  } else {
    // Partial path: fetch only [startRow..endRow] — data rows only, no header
    const rangeEnd = endRow !== null ? `${endCol}${endRow}` : endCol;
    rows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A${startRow}:${rangeEnd}`);
    actualHeaderRow = report.headerRow;
    rowOffset = startRow - 2;
  }

  const records = mapRowsToExpenseRecords(rows, sheetCurrencies, customColumns, actualHeaderRow, mapping, rowOffset);
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

export async function appendExpenseRow(accessToken, spreadsheetId, values, mapping = null) {
  const report = await validateSpreadsheet(accessToken, spreadsheetId, mapping);
  const canonicalHeaders = buildExpenseHeaders(report.sheetCurrencies, report.customColumns);

  // Align outgoing row values to the actual sheet header order.
  // Some legacy sheets can have custom columns before Comment.
  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const actualHeaders = normalizeHeaders(headerRows[0] ?? []);
  const targetHeaders = actualHeaders.length > 0 ? actualHeaders : canonicalHeaders;

  const { alignedValues, endCol } = alignValuesToHeaders(canonicalHeaders, targetHeaders, values, mapping);

  const appendResult = await requestJson(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      `${SHEET_NAME}!A:${endCol}`,
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({
        majorDimension: "ROWS",
        values: [alignedValues],
      }),
    },
  );

  const updatedRange = appendResult?.updates?.updatedRange ?? "";
  const rowNumber = parseInt(/([0-9]+)$/.exec(updatedRange)?.[1] ?? "0", 10);
  const record = buildRecordFromCanonicalValues(values, rowNumber, report.sheetCurrencies, report.customColumns);

  return { record, sheetCurrencies: report.sheetCurrencies, customColumns: report.customColumns };
}

/**
 * Align an array of canonical-order expense values to the actual sheet header order,
 * applying column mapping when provided.
 * Returns { alignedValues, endCol }.
 */
function alignValuesToHeaders(canonicalHeaders, targetHeaders, values, mapping) {
  const valueByCanonicalHeader = new Map();
  for (let index = 0; index < canonicalHeaders.length; index += 1) {
    valueByCanonicalHeader.set(canonicalHeaders[index].toLowerCase(), values[index] ?? "");
  }
  if (mapping) {
    for (const [qeField, userCol] of Object.entries(mapping)) {
      if (!targetHeaders.some((h) => h.toLowerCase() === userCol.toLowerCase())) {
        throw new Error(`Column '${userCol}' (mapped from '${qeField}') not found in sheet.`);
      }
      const val = valueByCanonicalHeader.get(qeField.toLowerCase());
      if (val !== undefined) {
        valueByCanonicalHeader.set(userCol.toLowerCase(), val);
      }
    }
  }
  const alignedValues = targetHeaders.map((header) => valueByCanonicalHeader.get(header.toLowerCase()) ?? "");
  const endCol = columnLetter(targetHeaders.length);
  return { alignedValues, endCol };
}

/**
 * Add a new expense row using append or insert mode depending on the submitted date.
 *
 * - If the sheet has no data, the date parser is unavailable, the sheet dates are
 *   out of order, or the submitted date is >= the last row's date → append (current behaviour).
 * - Otherwise the submitted date is in the past relative to at least one existing row:
 *   scan backward to find the last row whose date <= submitted date, then insert a
 *   new sheet row immediately after it using batchUpdate insertDimension.
 *
 * Returns { record, insertMode, sheetCurrencies, customColumns }.
 */
export async function addExpenseRow(accessToken, spreadsheetId, values, mapping = null) {
  // Read date column to decide append vs insert.
  const dateRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:A`);
  const dateValues = dateRows.slice(1).map((r) => r[0] ?? "");
  const parser = buildDateParser(dateValues.filter(Boolean).slice(0, 30));

  const dateOrderIssueRows = parser ? detectDateOrderIssue(dateValues, parser) : [];
  const submittedMs = parser ? parseDateToMs(values[0], parser) : null;
  const lastMs = (parser && dateValues.length > 0)
    ? parseDateToMs(dateValues[dateValues.length - 1], parser)
    : null;

  const useInsert =
    dateOrderIssueRows.length === 0 &&
    submittedMs !== null &&
    lastMs !== null &&
    dateValues.length > 0 &&
    submittedMs < lastMs;

  if (!useInsert) {
    const result = await appendExpenseRow(accessToken, spreadsheetId, values, mapping);
    return { ...result, insertMode: false };
  }

  // ── Insert mode ────────────────────────────────────────────────────────────
  const report = await validateSpreadsheet(accessToken, spreadsheetId, mapping);
  const canonicalHeaders = buildExpenseHeaders(report.sheetCurrencies, report.customColumns);

  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const actualHeaders = normalizeHeaders(headerRows[0] ?? []);
  const targetHeaders = actualHeaders.length > 0 ? actualHeaders : canonicalHeaders;

  const { alignedValues, endCol } = alignValuesToHeaders(canonicalHeaders, targetHeaders, values, mapping);

  // Find the last 0-based index in dateValues where date <= submittedMs.
  let insertAfterDataIndex = -1; // -1 means insert before all data rows (right after header)
  for (let i = dateValues.length - 1; i >= 0; i--) {
    const ms = parseDateToMs(dateValues[i], parser);
    if (ms !== null && ms <= submittedMs) {
      insertAfterDataIndex = i;
      break;
    }
  }

  // Sheet row numbers: header = 1, first data row = 2.
  // insertAfterDataIndex is 0-based in dateValues (data rows only).
  // The new row should be inserted after sheet row (insertAfterDataIndex + 2) when index >= 0,
  // or after sheet row 1 (the header) when index === -1.
  const insertAfterSheetRow = insertAfterDataIndex + 2; // e.g. index -1 → after row 1; index 0 → after row 2
  const newRowNumber = insertAfterSheetRow + 1; // the row number of the newly inserted row

  // Obtain sheet (tab) ID for batchUpdate.
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const expenseSheet = metadata.sheets?.find((s) => s.properties?.title === SHEET_NAME);
  if (!expenseSheet) throw new Error("Expenses sheet not found.");
  const sheetId = expenseSheet.properties.sheetId;

  // Insert a blank row: 0-based startIndex = insertAfterSheetRow (rows after that shift down by 1).
  await requestNoContent(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: createHeaders(accessToken, true),
      body: JSON.stringify({
        requests: [{
          insertDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: insertAfterSheetRow,
              endIndex: insertAfterSheetRow + 1,
            },
            inheritFromBefore: true,
          },
        }],
      }),
    },
  );

  // Write the expense data into the newly inserted blank row.
  await updateValues(
    accessToken,
    spreadsheetId,
    `${SHEET_NAME}!A${newRowNumber}:${endCol}${newRowNumber}`,
    [alignedValues],
  );

  const record = buildRecordFromCanonicalValues(values, newRowNumber, report.sheetCurrencies, report.customColumns);
  return { record, insertMode: true, sheetCurrencies: report.sheetCurrencies, customColumns: report.customColumns };
}

export async function updateExpenseRow(accessToken, spreadsheetId, rowNumber, values, mapping = null) {
  const report = await validateSpreadsheet(accessToken, spreadsheetId, mapping);
  const canonicalHeaders = buildExpenseHeaders(report.sheetCurrencies, report.customColumns);

  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const actualHeaders = normalizeHeaders(headerRows[0] ?? []);
  const targetHeaders = actualHeaders.length > 0 ? actualHeaders : canonicalHeaders;

  const { alignedValues, endCol } = alignValuesToHeaders(canonicalHeaders, targetHeaders, values, mapping);

  await updateValues(
    accessToken,
    spreadsheetId,
    `${SHEET_NAME}!A${rowNumber}:${endCol}${rowNumber}`,
    [alignedValues],
  );

  const record = buildRecordFromCanonicalValues(values, rowNumber, report.sheetCurrencies, report.customColumns);
  return { record, sheetCurrencies: report.sheetCurrencies, customColumns: report.customColumns };
}

/**
 * Build an ExpenseRecord from canonical-order values (the order produced by buildExpenseHeaders).
 * Used to construct the return payload for write operations without a second sheet read.
 */
function buildRecordFromCanonicalValues(values, rowNumber, sheetCurrencies, customColumns) {
  const currencyAmounts = {};
  for (let i = 0; i < sheetCurrencies.length; i++) {
    currencyAmounts[sheetCurrencies[i]] = values[1 + i] ?? "";
  }
  const fixedStart = 1 + sheetCurrencies.length;
  const customFields = {};
  for (let i = 0; i < customColumns.length; i++) {
    customFields[customColumns[i]] = values[fixedStart + 4 + i] ?? "";
  }
  return {
    Date: values[0] ?? "",
    currencyAmounts,
    USD: values[fixedStart] ?? "",
    Category: values[fixedStart + 1] ?? "",
    spentBy: values[fixedStart + 2] ?? "",
    Comment: values[fixedStart + 3] ?? "",
    customFields,
    rowNumber,
  };
}

export { SHEET_NAME, DEFAULT_CUSTOM_COLUMNS, MAX_CUSTOM_COLUMNS, MAX_OPTIONAL_CURRENCIES };
