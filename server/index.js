import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import {
  buildGoogleAuthorizationUrl,
  exchangeAuthorizationCode,
  fetchGoogleUserInfo,
  getFrontendBaseUrl,
  getGoogleClientId,
  createPkcePair,
  refreshAccessToken,
} from "./google-client.js";
import { validateMappingRequestBody } from "./validation.js";
import {
  appendExpenseRow,
  createSpreadsheet,
  loadExpenses,
  parseSpreadsheetUrl,
  validateSpreadsheet,
  hasExactItemSet,
  insertCurrencyColumnInSheet,
  insertCustomColumnInSheet,
  renameColumnInSheet,
  reorderCustomColumnsInSheet,
  reorderCurrencyColumnsInSheet,
  isCustomColumnEmpty,
  deleteColumnFromSheet,
  findColumnIndex,
  detectConfigSheet,
  readExpensesSheetHeader,
  writeConfigSheetMapping,
  DEFAULT_CUSTOM_COLUMNS,
  MAX_CUSTOM_COLUMNS,
  MAX_OPTIONAL_CURRENCIES,
  validateColumnName,
} from "./google-sheets.js";
import {
  checkDatabaseHealth,
  createGracefulShutdown,
  createRequireAuthenticatedUser,
  createShutdownGuard,
  destroySession,
  logInfrastructureError,
  safelyDestroySession,
} from "./resilience.js";
import {
  getUserRecord,
  updateUserRecord,
  saveFxRateBackup,
  getLatestFxRateBackup,
} from "./store.js";
import pool from "./db.js";

const PgSession = connectPgSimple(session);
const app = express();
app.set("trust proxy", 1);

const port = Number(process.env.PORT ?? 3001);
const shutdownTimeoutMs = 10_000;
const maxApiJsonBodySize = process.env.API_JSON_BODY_LIMIT?.trim() || "10mb";

let isShuttingDown = false;
let server;
let signalHandlersRegistered = false;

function validateStartupEnv() {
  const missing = [];

  if (!getGoogleClientId()) {
    missing.push("GOOGLE_CLIENT_ID");
  }

  ["GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_API_KEY", "FRONTEND_BASE_URL", "SESSION_SECRET", "DATABASE_URL"].forEach(
    (name) => {
      if (!process.env[name]?.trim()) {
        missing.push(name);
      }
    },
  );

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

validateStartupEnv();

app.use("/api", express.json({ limit: maxApiJsonBodySize }));

app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  const startedAt = process.hrtime.bigint();

  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const logEntry = {
      level: "info",
      event: "http_request",
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Number(elapsedMs.toFixed(2)),
      shuttingDown: isShuttingDown,
    };

    console.log(JSON.stringify(logEntry));
  });

  next();
});

app.get("/api/health", async (_req, res) => {
  const health = await checkDatabaseHealth(pool);
  const ok = health.ok && !isShuttingDown;

  res.status(ok ? 200 : 503).json({
    ...health,
    ok,
    checks: {
      ...health.checks,
      shutdown: isShuttingDown ? "in_progress" : "ready",
    },
  });
});

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "sessions",
      pruneSessionInterval: 60 * 15,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.FRONTEND_BASE_URL?.startsWith("https"),
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use((req, res, next) => {
  if (["POST", "PUT", "DELETE"].includes(req.method)) {
    if (req.headers["x-requested-with"] !== "fetch") {
      res.status(403).json({ message: "Forbidden." });
      return;
    }
  }
  next();
});

function getUserSession(req) {
  return req.session.userEmail ? { email: req.session.userEmail } : null;
}

const requireAuthenticatedUser = createRequireAuthenticatedUser({
  getUserSession,
  getUserRecord,
  destroySessionState: safelyDestroySession,
});

async function getAuthorizedAccessToken(userRecord) {
  if (userRecord.accessToken && userRecord.accessTokenExpiresAt > Date.now() + 60_000) {
    return userRecord.accessToken;
  }

  if (!userRecord.refreshToken) {
    throw new Error("Session has expired and no refresh token is available.");
  }

  const refreshed = await refreshAccessToken(userRecord.refreshToken);
  const updatedUser = await updateUserRecord(userRecord.email, (current) => ({
    ...current,
    accessToken: refreshed.access_token,
    accessTokenExpiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    refreshToken: refreshed.refresh_token ?? current.refreshToken,
  }));

  return updatedUser.accessToken;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please try again later." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});

app.use(createShutdownGuard({ isShuttingDown: () => isShuttingDown, excludedPaths: ["/api/health"] }));
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/callback", authLimiter);
app.use("/api/", (req, res, next) => {
  if (req.path === "/health") {
    next();
    return;
  }

  apiLimiter(req, res, next);
});

app.get("/api/auth/login", (req, res) => {
  try {
    const state = crypto.randomUUID();
    const { verifier, challenge } = createPkcePair();
    req.session.oauthState = state;
    req.session.codeVerifier = verifier;
    res.redirect(buildGoogleAuthorizationUrl({ state, codeChallenge: challenge }));
  } catch (error) {
    res.status(500).send((error).message);
  }
});

app.get("/api/auth/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      res.redirect(`${getFrontendBaseUrl()}/?error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (
      typeof code !== "string" ||
      typeof state !== "string" ||
      state !== req.session.oauthState ||
      !req.session.codeVerifier
    ) {
      res.redirect(`${getFrontendBaseUrl()}/?error=${encodeURIComponent("OAuth callback validation failed.")}`);
      return;
    }

    const tokenPayload = await exchangeAuthorizationCode({
      code,
      codeVerifier: req.session.codeVerifier,
    });

    const userInfo = await fetchGoogleUserInfo(tokenPayload.access_token);
    const now = Date.now();

    await updateUserRecord(userInfo.email, (current) => ({
      ...current,
      email: userInfo.email,
      accessToken: tokenPayload.access_token,
      accessTokenExpiresAt: now + (tokenPayload.expires_in ?? 3600) * 1000,
      refreshToken: tokenPayload.refresh_token ?? current.refreshToken,
      lastAuthenticatedAt: now,
      lastActivityAt: now,
      spreadsheetUrl: current.spreadsheetUrl ?? null,
      spreadsheetId: current.spreadsheetId ?? null,
    }));

    req.session.regenerate((err) => {
      if (err) {
        res.redirect(`${getFrontendBaseUrl()}/?error=${encodeURIComponent("Session regeneration failed.")}`);
        return;
      }
      req.session.userEmail = userInfo.email;
      res.redirect(`${getFrontendBaseUrl()}/home`);
    });
  } catch (callbackError) {
    res.redirect(
      `${getFrontendBaseUrl()}/?error=${encodeURIComponent((callbackError).message)}`,
    );
  }
});

app.get("/api/auth/session", async (req, res) => {
  const sessionUser = getUserSession(req);
  if (!sessionUser) {
    res.json({ authenticated: false });
    return;
  }

  try {
    const userRecord = await getUserRecord(sessionUser.email);
    if (!userRecord) {
      await safelyDestroySession(req.session, "Failed to clear missing stored session.");
      res.json({ authenticated: false });
      return;
    }

    res.json({
      authenticated: true,
      session: {
        email: userRecord.email,
        lastAuthenticatedAt: userRecord.lastAuthenticatedAt,
        lastActivityAt: userRecord.lastActivityAt,
      },
    });
  } catch (error) {
    logInfrastructureError("Failed to load auth session", error);
    res.status(500).json({ message: "Unable to load your session right now. Please try again." });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    await destroySession(req.session);
    res.status(204).end();
  } catch (error) {
    logInfrastructureError("Failed to destroy session during logout", error);
    res.status(500).json({ message: "Unable to sign out right now. Please try again." });
  }
});

app.get("/api/config", requireAuthenticatedUser, async (req, res) => {
  const { userRecord } = req;
  if (!userRecord.spreadsheetId || !userRecord.spreadsheetUrl) {
    res.json({ config: null });
    return;
  }

  try {
    const accessToken = await getAuthorizedAccessToken(userRecord);
    const { mode: configMode, mapping = null, reason: configModeReason } =
      await detectConfigSheet(accessToken, userRecord.spreadsheetId);

    const report = await validateSpreadsheet(accessToken, userRecord.spreadsheetId, mapping);

    res.json({
      config: {
        email: userRecord.email,
        spreadsheetId: userRecord.spreadsheetId,
        spreadsheetUrl: userRecord.spreadsheetUrl,
        sheetName: "Expenses",
        currencies: report.sheetCurrencies,
        customColumns: report.customColumns,
        configMode,
        ...(configModeReason ? { configModeReason } : {}),
      },
    });
  } catch (error) {
    res.status(500).json({ message: (error).message });
  }
});

app.post("/api/config", requireAuthenticatedUser, async (req, res) => {
  try {
    const spreadsheetUrl = String(req.body?.spreadsheetUrl ?? "").trim();
    const spreadsheetId = parseSpreadsheetUrl(spreadsheetUrl);
    if (!spreadsheetId) {
      res.status(400).json({ message: "Provide a valid Google Sheets link before saving." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);

    // Persist the spreadsheetId before validation so that POST /api/config/mapping
    // can work even when validation fails due to column mismatches.
    const updatedUser = await updateUserRecord(req.userRecord.email, (current) => ({
      ...current,
      spreadsheetUrl,
      spreadsheetId,
    }));

    // Detect any existing Config sheet and validate using its mapping so config-driven sheets pass.
    const { mode: configMode, mapping = null, reason: configModeReason } =
      await detectConfigSheet(accessToken, spreadsheetId);

    const setupReport = await validateSpreadsheet(accessToken, spreadsheetId, mapping);

    res.json({
      config: {
        email: updatedUser.email,
        spreadsheetId: updatedUser.spreadsheetId,
        spreadsheetUrl: updatedUser.spreadsheetUrl,
        sheetName: "Expenses",
        currencies: setupReport.sheetCurrencies,
        customColumns: setupReport.customColumns,
        configMode,
        ...(configModeReason ? { configModeReason } : {}),
      },
      setupReport,
    });
  } catch (error) {
    const body = { message: (error).message };
    if (error.headerDetails) {
      body.headerDetails = error.headerDetails;
    }
    res.status(400).json(body);
  }
});

app.post("/api/config/create-spreadsheet", requireAuthenticatedUser, async (req, res) => {
  try {
    const rawName = String(req.body?.name ?? "").trim();
    const name = rawName.slice(0, 100) || "Quick Expense — My Expenses";

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(accessToken, name);
    const setupReport = await validateSpreadsheet(accessToken, spreadsheetId);

    const updatedUser = await updateUserRecord(req.userRecord.email, (current) => ({
      ...current,
      spreadsheetUrl,
      spreadsheetId,
    }));

    res.json({
      config: {
        email: updatedUser.email,
        spreadsheetId: updatedUser.spreadsheetId,
        spreadsheetUrl: updatedUser.spreadsheetUrl,
        sheetName: "Expenses",
        currencies: setupReport.sheetCurrencies,
        customColumns: setupReport.customColumns,
        configMode: "default",
      },
      setupReport,
    });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.get("/api/config/mapping", requireAuthenticatedUser, async (req, res) => {
  if (!req.userRecord.spreadsheetId) {
    res.status(400).json({ message: "Spreadsheet is not configured." });
    return;
  }
  try {
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const [configResult, detectedColumns] = await Promise.all([
      detectConfigSheet(accessToken, req.userRecord.spreadsheetId),
      readExpensesSheetHeader(accessToken, req.userRecord.spreadsheetId),
    ]);
    res.json({
      mapping: configResult.mode === "config-driven" ? configResult.mapping : null,
      mode: configResult.mode,
      detectedColumns,
    });
  } catch (error) {
    res.status(500).json({ message: (error).message });
  }
});

app.post("/api/config/mapping", requireAuthenticatedUser, async (req, res) => {
  if (!req.userRecord.spreadsheetId) {
    res.status(400).json({
      message:
        "Spreadsheet is not configured. Submit a valid spreadsheet URL in Setup first — " +
        "the URL must be saved successfully before a column mapping can be applied.",
    });
    return;
  }
  const validation = validateMappingRequestBody(req.body);
  if (!validation.valid) {
    res.status(400).json({ message: validation.message });
    return;
  }
  const mapping = req.body.mapping;
  try {
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    await writeConfigSheetMapping(accessToken, req.userRecord.spreadsheetId, mapping);
    const mode = "config-driven";
    res.json({ mapping, mode });
  } catch (error) {
    res.status(500).json({ message: (error).message });
  }
});

app.get("/api/auth/picker-config", requireAuthenticatedUser, async (req, res) => {
  try {
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const appId = getGoogleClientId().split("-")[0];
    res.json({ accessToken, apiKey: process.env.GOOGLE_API_KEY, appId });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.delete("/api/config", requireAuthenticatedUser, async (req, res) => {
  await updateUserRecord(req.userRecord.email, (current) => ({
    ...current,
    spreadsheetUrl: null,
    spreadsheetId: null,
  }));
  res.status(204).end();
});

// --- Expenses ---

app.get("/api/expenses", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.userRecord.spreadsheetId);
    const mapping = mode === "config-driven" ? configMapping : null;
    const snapshot = await loadExpenses(accessToken, req.userRecord.spreadsheetId, mapping);
    res.json(snapshot);
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.get("/api/fx-backup", requireAuthenticatedUser, async (req, res) => {
  const backup = await getLatestFxRateBackup(req.userRecord.email, req.userRecord.spreadsheetId);
  res.json({ backup });
});

app.post("/api/expenses", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const values = req.body?.values;
    if (!Array.isArray(values)) {
      res.status(400).json({ message: "Expense row values are required." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: expenseMode, mapping: expenseMapping = null } = await detectConfigSheet(accessToken, req.userRecord.spreadsheetId);
    const mapping = expenseMode === "config-driven" ? expenseMapping : null;
    await appendExpenseRow(accessToken, req.userRecord.spreadsheetId, values, mapping);

    if (req.body?.fxRateBackup && typeof req.body.fxRateBackup === "object") {
      await saveFxRateBackup(req.userRecord.email, req.userRecord.spreadsheetId, req.body.fxRateBackup);
    }

    res.status(204).end();
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

// ─── Sheet Structure Management ───────────────────────────────────────────────

app.post("/api/sheet/currency", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Connect a spreadsheet first." });
      return;
    }

    const code = String(req.body?.code ?? "").trim();
    if (!code || code.length > 10) {
      res.status(400).json({ message: "Currency code must be 1–10 characters." });
      return;
    }
    if (code.toLowerCase() === "usd") {
      res.status(400).json({ message: "USD is a mandatory column and cannot be added as optional." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const result = await insertCurrencyColumnInSheet(accessToken, req.userRecord.spreadsheetId, code);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.post("/api/sheet/column", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Connect a spreadsheet first." });
      return;
    }

    const name = String(req.body?.name ?? "").trim();

    // Read current structure to validate against existing names
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.userRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);

    if (report.customColumns.length >= MAX_CUSTOM_COLUMNS) {
      res.status(400).json({ message: `You can have at most ${MAX_CUSTOM_COLUMNS} custom columns.` });
      return;
    }

    const nameError = validateColumnName(name, report.customColumns);
    if (nameError) {
      res.status(400).json({ message: nameError });
      return;
    }

    await insertCustomColumnInSheet(accessToken, req.userRecord.spreadsheetId, name);

    // Re-read to return updated structure
    const updated = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);
    res.status(201).json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.patch("/api/sheet/column/rename", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const currentName = String(req.body?.currentName ?? "").trim();
    const newName = String(req.body?.newName ?? "").trim();

    if (!currentName) {
      res.status(400).json({ message: "currentName is required." });
      return;
    }

    // Validate new name
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.userRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);
    const allNames = [...report.sheetCurrencies, ...report.customColumns];
    const nameError = validateColumnName(newName, allNames, currentName);
    if (nameError) {
      res.status(400).json({ message: nameError });
      return;
    }

    // Check that currentName is not a mandatory column
    const mandatory = ["date", "usd", "category", "spent by", "comment"];
    if (mandatory.includes(currentName.toLowerCase())) {
      res.status(400).json({ message: "Mandatory columns cannot be renamed." });
      return;
    }

    const colIndex = await findColumnIndex(accessToken, req.userRecord.spreadsheetId, currentName);
    if (colIndex === null) {
      res.status(404).json({ message: `Column "${currentName}" not found in sheet.` });
      return;
    }

    await renameColumnInSheet(accessToken, req.userRecord.spreadsheetId, colIndex, newName);

    const updated = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);
    res.json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.put("/api/sheet/columns/reorder", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const orderedNames = req.body?.orderedNames;
    if (!Array.isArray(orderedNames) || !orderedNames.every((n) => typeof n === "string")) {
      res.status(400).json({ message: "orderedNames must be an array of strings." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.userRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);

    if (!hasExactItemSet(report.customColumns, orderedNames)) {
      res.status(400).json({ message: "orderedNames must contain all custom columns exactly once." });
      return;
    }

    await reorderCustomColumnsInSheet(accessToken, req.userRecord.spreadsheetId, orderedNames);

    const updated = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);
    res.json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.put("/api/sheet/currencies/reorder", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const orderedCodes = req.body?.orderedCodes;
    if (!Array.isArray(orderedCodes) || !orderedCodes.every((n) => typeof n === "string")) {
      res.status(400).json({ message: "orderedCodes must be an array of strings." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.userRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);

    if (!hasExactItemSet(report.sheetCurrencies, orderedCodes)) {
      res.status(400).json({ message: "orderedCodes must contain all currency columns exactly once." });
      return;
    }

    await reorderCurrencyColumnsInSheet(accessToken, req.userRecord.spreadsheetId, orderedCodes);

    const updated = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);
    res.json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.delete("/api/sheet/column", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      res.status(400).json({ message: "Column name is required." });
      return;
    }

    const mandatory = ["date", "usd", "category", "spent by", "comment"];
    if (mandatory.includes(name.toLowerCase())) {
      res.status(400).json({ message: "Mandatory columns cannot be removed." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.userRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const colIndex = await findColumnIndex(accessToken, req.userRecord.spreadsheetId, name);
    if (colIndex === null) {
      res.status(404).json({ message: `Column "${name}" not found in sheet.` });
      return;
    }

    const empty = await isCustomColumnEmpty(accessToken, req.userRecord.spreadsheetId, colIndex);
    if (!empty) {
      res.status(409).json({
        message: "This column contains data and cannot be removed from the app. To delete it, remove the data first or delete the column directly in Google Sheets.",
      });
      return;
    }

    await deleteColumnFromSheet(accessToken, req.userRecord.spreadsheetId, colIndex);

    const updated = await validateSpreadsheet(accessToken, req.userRecord.spreadsheetId, mapping);
    res.json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.use((error, req, res, next) => {
  logInfrastructureError("Unhandled request error", error);

  if (res.headersSent) {
    next(error);
    return;
  }

  if (req.path.startsWith("/api/")) {
    res.status(503).json({ message: "Service temporarily unavailable. Please try again." });
    return;
  }

  res.status(500).send("Unexpected server error.");
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const shutdownServer = createGracefulShutdown({
  getServer: () => server,
  closeDatabase: () => pool.end(),
  setShuttingDown: (nextValue) => {
    isShuttingDown = nextValue;
  },
  timeoutMs: shutdownTimeoutMs,
});

function registerSignalHandlers() {
  if (signalHandlersRegistered) {
    return;
  }

  signalHandlersRegistered = true;
  process.once("SIGTERM", () => {
    void shutdownServer("SIGTERM");
  });
  process.once("SIGINT", () => {
    void shutdownServer("SIGINT");
  });
}

export function startServer() {
  if (server) {
    return server;
  }

  server = app.listen(port, () => {
    console.log(`QuickExpense backend listening on http://localhost:${port}`);
  });
  registerSignalHandlers();
  return server;
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  startServer();
}

export { app, shutdownServer };
