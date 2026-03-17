const SHEET_NAME = "Expenses";
const EXPENSE_HEADERS = [
  "Date",
  "PLN",
  "BYN",
  "EUR",
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
  const allRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:K`);
  const migratedRows = allRows.map((row, index) =>
    index === 0 ? [...EXPENSE_HEADERS] : remapLegacyRowToCurrent(row),
  );

  await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:K${migratedRows.length}`, migratedRows);
}

function mapRowsToExpenseRecords(rows) {
  return rows.map((row, index) => {
    const padded = [...row];
    while (padded.length < EXPENSE_HEADERS.length) {
      padded.push("");
    }

    return {
      Date: padded[0] ?? "",
      PLN: padded[1] ?? "",
      BYN: padded[2] ?? "",
      EUR: padded[3] ?? "",
      USD: padded[4] ?? "",
      Category: padded[5] ?? "",
      WhoSpent: padded[6] ?? "",
      ForWhom: padded[7] ?? "",
      Comment: padded[8] ?? "",
      PaymentChannel: padded[9] ?? "",
      Theme: padded[10] ?? "",
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

export async function validateSpreadsheet(accessToken, spreadsheetId) {
  const metadata = await getMetadata(accessToken, spreadsheetId);
  const hasExpenseSheet = metadata.sheets?.some(
    (sheet) => sheet.properties?.title === SHEET_NAME,
  );

  if (!hasExpenseSheet) {
    throw new Error(`Spreadsheet must contain a sheet named "${SHEET_NAME}".`);
  }

  const headerRows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!1:1`);
  const headerRow = headerRows[0];

  if (isHeaderRowEmpty(headerRow)) {
    await updateValues(accessToken, spreadsheetId, `${SHEET_NAME}!A1:K1`, [
      [...EXPENSE_HEADERS],
    ]);
    return;
  }

  if (validateLegacyHeaderRow(headerRow)) {
    await migrateLegacyColumnOrder(accessToken, spreadsheetId);
    return;
  }

  if (!validateHeaderRow(headerRow)) {
    throw new Error(
      `The "${SHEET_NAME}" sheet header must match the required column names and order exactly.`,
    );
  }
}

export async function loadExpenses(accessToken, spreadsheetId) {
  await validateSpreadsheet(accessToken, spreadsheetId);
  const rows = await getValues(accessToken, spreadsheetId, `${SHEET_NAME}!A:K`);
  const records = mapRowsToExpenseRecords(rows.slice(1));
  const payloadBytes = calculateJsonByteSize(records);

  if (payloadBytes > MAX_DATASET_BYTES) {
    throw new Error("Spreadsheet data is too large for Tail/Search. The JSON payload exceeds 10 MB.");
  }

  return {
    records,
    payloadBytes,
  };
}

export async function appendExpenseRow(accessToken, spreadsheetId, values) {
  await validateSpreadsheet(accessToken, spreadsheetId);

  await requestNoContent(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      `${SHEET_NAME}!A:K`,
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
}
