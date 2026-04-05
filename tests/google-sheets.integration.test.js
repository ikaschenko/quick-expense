import { readFileSync } from "node:fs";

/**
 * Integration tests for validateSpreadsheet against real Google Sheets.
 *
 * Required env vars (set in .env or shell):
 *   GOOGLE_SERVICE_ACCOUNT_KEY_FILE — path to the service account JSON key file
 *     (or GOOGLE_SERVICE_ACCOUNT_KEY — raw JSON string, used as fallback)
 *   TEST_SHEET_BLANK               — spreadsheet ID with NO "Expenses" tab
 *   TEST_SHEET_INVALID             — spreadsheet ID with "Expenses" tab + wrong headers
 *   TEST_SHEET_VALID               — spreadsheet ID with "Expenses" tab + correct headers
 *
 * All spreadsheets must be shared with the service account's client_email as Editor.
 */

function loadServiceAccountKey() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile) {
    return readFileSync(keyFile, "utf-8");
  }
  return process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "";
}

const serviceAccountKeyJson = loadServiceAccountKey();

const REQUIRED_VARS = {
  "GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_KEY_FILE": serviceAccountKeyJson,
  TEST_SHEET_BLANK: process.env.TEST_SHEET_BLANK,
  TEST_SHEET_INVALID: process.env.TEST_SHEET_INVALID,
  TEST_SHEET_VALID: process.env.TEST_SHEET_VALID,
};

const missing = Object.entries(REQUIRED_VARS)
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) {
  throw new Error(
    `Integration tests require the following environment variables: ${missing.join(", ")}`,
  );
}

const EXPENSE_HEADERS = [
  "Date", "PLN", "BYN", "EUR", "USD",
  "Category", "WhoSpent", "ForWhom", "Comment", "PaymentChannel", "Theme",
];
const INVALID_HEADERS = [
  "Date", "USD", "PLN", "BYN", "EUR",
  "Cat", "Who", "For", "Note", "Pay", "Tag",
];

// ── Service-account token helper (raw JWT, no extra dependencies) ──

async function getServiceAccountToken(keyJson) {
  const key = JSON.parse(keyJson);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${enc(header)}.${enc(payload)}`;

  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(key.private_key, "base64url");

  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── Google Sheets API helpers for cleanup ──

async function sheetsRequest(accessToken, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function getSheetList(accessToken, spreadsheetId) {
  const data = await sheetsRequest(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  );
  return data.sheets.map((s) => s.properties);
}

async function deleteSheet(accessToken, spreadsheetId, sheetId) {
  await sheetsRequest(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests: [{ deleteSheet: { sheetId } }] }),
    },
  );
}

async function addSheet(accessToken, spreadsheetId, title) {
  const data = await sheetsRequest(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    },
  );
  return data.replies[0].addSheet.properties.sheetId;
}

async function writeHeaders(accessToken, spreadsheetId, sheetName, headers) {
  await sheetsRequest(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A1:K1`)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      body: JSON.stringify({ range: `${sheetName}!A1:K1`, majorDimension: "ROWS", values: [headers] }),
    },
  );
}

async function clearSheet(accessToken, spreadsheetId, sheetName) {
  await sheetsRequest(
    accessToken,
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${sheetName}!A:Z`)}:clear`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

// ── Reset helpers per spreadsheet ──

async function resetBlankSheet(accessToken, spreadsheetId) {
  const sheets = await getSheetList(accessToken, spreadsheetId);
  const expenses = sheets.find((s) => s.title === "Expenses");
  if (expenses) {
    // Ensure there's at least one other sheet before deleting
    if (sheets.length === 1) {
      await addSheet(accessToken, spreadsheetId, "Sheet1");
    }
    await deleteSheet(accessToken, spreadsheetId, expenses.sheetId);
  }
}

async function resetInvalidSheet(accessToken, spreadsheetId) {
  const sheets = await getSheetList(accessToken, spreadsheetId);
  const expenses = sheets.find((s) => s.title === "Expenses");
  if (!expenses) {
    await addSheet(accessToken, spreadsheetId, "Expenses");
  }
  await clearSheet(accessToken, spreadsheetId, "Expenses");
  await writeHeaders(accessToken, spreadsheetId, "Expenses", INVALID_HEADERS);
}

async function resetValidSheet(accessToken, spreadsheetId) {
  const sheets = await getSheetList(accessToken, spreadsheetId);
  const expenses = sheets.find((s) => s.title === "Expenses");
  if (!expenses) {
    await addSheet(accessToken, spreadsheetId, "Expenses");
  }
  await clearSheet(accessToken, spreadsheetId, "Expenses");
  await writeHeaders(accessToken, spreadsheetId, "Expenses", EXPENSE_HEADERS);
}

// ── Tests ──

let validateSpreadsheet;

describe("validateSpreadsheet — integration", () => {
  let accessToken;
  const BLANK = process.env.TEST_SHEET_BLANK;
  const INVALID = process.env.TEST_SHEET_INVALID;
  const VALID = process.env.TEST_SHEET_VALID;

  beforeAll(async () => {
    ({ validateSpreadsheet } = await import("../server/google-sheets.js"));
    accessToken = await getServiceAccountToken(serviceAccountKeyJson);

    // Reset all three spreadsheets to their starting conditions
    await Promise.all([
      resetBlankSheet(accessToken, BLANK),
      resetInvalidSheet(accessToken, INVALID),
      resetValidSheet(accessToken, VALID),
    ]);
  }, 30_000);

  afterAll(async () => {
    if (!accessToken) return;

    // Restore starting conditions after tests
    await Promise.all([
      resetBlankSheet(accessToken, BLANK),
      resetInvalidSheet(accessToken, INVALID),
      resetValidSheet(accessToken, VALID),
    ]);
  }, 30_000);

  it("auto-creates Expenses tab and headers on blank spreadsheet", async () => {
    const report = await validateSpreadsheet(accessToken, BLANK);

    expect(report).toEqual({
      tabAction: "created",
      headersAction: "created",
    });

    // Verify the tab and headers actually exist now
    const sheets = await getSheetList(accessToken, BLANK);
    expect(sheets.some((s) => s.title === "Expenses")).toBe(true);
  }, 15_000);

  it("throws with headerDetails on spreadsheet with invalid headers", async () => {
    try {
      await validateSpreadsheet(accessToken, INVALID);
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error.message).toContain("header must match");
      expect(error.headerDetails).toBeDefined();
      expect(error.headerDetails.expected).toEqual(EXPENSE_HEADERS);
      expect(error.headerDetails.actual).toEqual(INVALID_HEADERS);
    }
  }, 15_000);

  it("validates successfully on spreadsheet with correct headers", async () => {
    const report = await validateSpreadsheet(accessToken, VALID);

    expect(report).toEqual({
      tabAction: "found",
      headersAction: "valid",
    });
  }, 15_000);
});
