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
import { validateMappingRequestBody, validateUsdMandatory } from "./validation.js";
import {
  createSpreadsheet,
  appendExpenseRow,
  addExpenseRow,
  updateExpenseRow,
  moveExpenseRow,
  deleteLastExpenseRow,
  loadExpenses,
  getExpenseRowCount,
  parseSpreadsheetUrl,
  getSpreadsheetFileMeta,
  getSpreadsheetModifiedTime,
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
  findExpenseStartRow,
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
  requireEditAccess,
  requireGuest,
  requireOwner,
  safelyDestroySession,
} from "./resilience.js";
import {
  getUserRecord,
  updateUserRecord,
  saveFxRateBackup,
  getLatestFxRateBackup,
  getHiddenColumns,
  setColumnVisibility,
  renameVisibilityEntry,
  hasOwnIndependentSetup,
} from "./store.js";
import {
  addShare,
  getShareForGuest,
  listSharesForOwner,
  removeShare,
  removeShareAsGuest,
  updateShareAccessLevel,
} from "./sharing.js";
import { sendShareGrantedEmail, sendShareRevokedEmail } from "./email.js";
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

// Number of months of recent expense data loaded in Phase 1 (blocking).
// Older data is fetched in the background after the UI is ready (Phase 2).
// Override via EXPENSE_RECENT_MONTHS env var if needed.
const RECENT_MONTHS = parseInt(process.env.EXPENSE_RECENT_MONTHS ?? "24", 10);

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
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (req.headers["x-requested-with"] !== "fetch") {
      res.status(403).json({ message: "Forbidden." });
      return;
    }
  }
  next();
});

function getUserSession(req) {
  return req.session.userEmail
    ? { email: req.session.userEmail, givenName: req.session.userGivenName ?? null, picture: req.session.userPicture ?? null }
    : null;
}

const requireAuthenticatedUser = createRequireAuthenticatedUser({
  getUserSession,
  getUserRecord,
  getShareForGuest,
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
      req.session.userGivenName = userInfo.given_name ?? null;
      req.session.userFullName  = userInfo.name ?? null;
      req.session.userPicture = userInfo.picture ?? null;
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

    const share = await getShareForGuest(sessionUser.email);
    let isGuest = false;
    let guestAccessLevel = null;
    let ownerEmail = null;
    let configStatus = "ok";

    if (share) {
      const ownerRecord = await getUserRecord(share.ownerEmail);
      isGuest = true;
      guestAccessLevel = share.accessLevel;
      ownerEmail = share.ownerEmail;
      configStatus = ownerRecord && ownerRecord.spreadsheetId ? "ok" : "shared_config_invalid";
    }

    res.json({
      authenticated: true,
      session: {
        email: userRecord.email,
        givenName: sessionUser.givenName,
        picture: sessionUser.picture,
        lastAuthenticatedAt: userRecord.lastAuthenticatedAt,
        lastActivityAt: userRecord.lastActivityAt,
        isGuest,
        guestAccessLevel,
        ownerEmail,
        configStatus,
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
  const configRecord = req.configRecord;
  if (!configRecord.spreadsheetId || !configRecord.spreadsheetUrl) {
    res.json({ config: null });
    return;
  }

  try {
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping = null, reason: configModeReason, predefinedCategories = [] } =
      await detectConfigSheet(accessToken, configRecord.spreadsheetId);

    const report = await validateSpreadsheet(accessToken, configRecord.spreadsheetId, mapping);

    let hiddenColumns = [];
    try {
      hiddenColumns = await getHiddenColumns(configRecord.email, configRecord.spreadsheetId);
    } catch {
      // Table may not exist yet before migration — fall back to empty.
    }

    res.json({
      config: {
        email: configRecord.email,
        spreadsheetId: configRecord.spreadsheetId,
        spreadsheetUrl: configRecord.spreadsheetUrl,
        sheetName: "Expenses",
        currencies: report.sheetCurrencies,
        customColumns: report.customColumns,
        configMode,
        predefinedCategories,
        hiddenColumns,
        isGuest: req.isGuest,
        accessLevel: req.accessLevel,
        ownerEmail: req.isGuest ? configRecord.email : null,
        ...(configModeReason ? { configModeReason } : {}),
      },
    });
  } catch (error) {
    res.status(500).json({ message: (error).message });
  }
});

app.patch("/api/config/column-visibility", requireAuthenticatedUser, requireOwner, async (req, res) => {
  if (!req.configRecord.spreadsheetId) {
    res.status(400).json({ message: "Spreadsheet is not configured." });
    return;
  }

  const field = String(req.body?.field ?? "").trim();
  const hidden = req.body?.hidden;

  if (!field || field.length > 30) {
    res.status(400).json({ message: "field must be a non-empty string of at most 30 characters." });
    return;
  }
  if (typeof hidden !== "boolean") {
    res.status(400).json({ message: "hidden must be a boolean." });
    return;
  }

  const nonHideableFields = ["date", "usd", "category", "spent by"];
  if (nonHideableFields.includes(field.toLowerCase())) {
    res.status(400).json({ message: `"${field}" is a mandatory field and cannot be hidden.` });
    return;
  }

  try {
    await setColumnVisibility(req.configRecord.email, req.configRecord.spreadsheetId, field, hidden);
    const hiddenColumns = await getHiddenColumns(req.configRecord.email, req.configRecord.spreadsheetId);
    res.json({ hiddenColumns });
  } catch (error) {
    res.status(500).json({ message: (error).message });
  }
});

app.post("/api/config", requireAuthenticatedUser, requireOwner, async (req, res) => {
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
    const { mode: configMode, mapping = null, reason: configModeReason, predefinedCategories = [] } =
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
        predefinedCategories,
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

app.post("/api/config/create-spreadsheet", requireAuthenticatedUser, requireOwner, async (req, res) => {
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
        predefinedCategories: [],
      },
      setupReport,
    });
  } catch (error) {
    const body = { message: error.message };
    if (error.templateCopyFailed) {
      body.templateCopyFailed = true;
      body.templateUrl = error.templateUrl;
    }
    res.status(400).json(body);
  }
});

app.get("/api/config/file-info", requireAuthenticatedUser, async (req, res) => {
  if (!req.configRecord.spreadsheetId) {
    res.status(400).json({ message: "Spreadsheet is not configured." });
    return;
  }
  try {
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { fileName } = await getSpreadsheetFileMeta(accessToken, req.configRecord.spreadsheetId);
    res.json({ fileName });
  } catch (error) {
    res.status(500).json({ message: (error).message });
  }
});

app.get("/api/sheet/modifiedtime", requireAuthenticatedUser, async (req, res) => {
  if (!req.configRecord.spreadsheetId) {
    return res.status(400).json({ error: "No spreadsheet configured." });
  }
  try {
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const result = await getSpreadsheetModifiedTime(accessToken, req.configRecord.spreadsheetId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/config/mapping", requireAuthenticatedUser, async (req, res) => {
  if (!req.configRecord.spreadsheetId) {
    res.status(400).json({ message: "Spreadsheet is not configured." });
    return;
  }
  try {
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const [configResult, detectedColumns] = await Promise.all([
      detectConfigSheet(accessToken, req.configRecord.spreadsheetId),
      readExpensesSheetHeader(accessToken, req.configRecord.spreadsheetId),
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

app.post("/api/config/mapping", requireAuthenticatedUser, requireOwner, async (req, res) => {
  if (!req.configRecord.spreadsheetId) {
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
    await writeConfigSheetMapping(accessToken, req.configRecord.spreadsheetId, mapping);
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

app.delete("/api/config", requireAuthenticatedUser, requireOwner, async (req, res) => {
  await updateUserRecord(req.userRecord.email, (current) => ({
    ...current,
    spreadsheetUrl: null,
    spreadsheetId: null,
  }));
  res.status(204).end();
});

// --- Expenses ---

app.get("/api/expenses/count", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const rowCount = await getExpenseRowCount(accessToken, req.configRecord.spreadsheetId);
    res.json({ rowCount });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/expenses/history", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const endRow = parseInt(req.query.endRow, 10);
    if (isNaN(endRow) || endRow < 2 || endRow > 500_000) {
      res.status(400).json({ message: "endRow must be an integer between 2 and 500000." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode, mapping: configMapping = null, metadata } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = mode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping, metadata);
    const snapshot = await loadExpenses(accessToken, req.configRecord.spreadsheetId, mapping, {
      startRow: 2,
      endRow,
      precomputedReport: report,
    });
    res.json({ ...snapshot, loadPhase: "full" });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.get("/api/expenses", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode, mapping: configMapping = null, metadata } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = mode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping, metadata);
    const { startRow, totalRows, isSplit, dateOrderIssueRows } = await findExpenseStartRow(accessToken, req.configRecord.spreadsheetId, RECENT_MONTHS);
    const snapshot = await loadExpenses(accessToken, req.configRecord.spreadsheetId, mapping, {
      startRow: isSplit ? startRow : null,
      precomputedReport: report,
    });
    res.json({
      ...snapshot,
      totalRows,
      startRow,
      loadPhase: isSplit ? "recent" : "full",
      dateOrderIssueRows,
    });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.get("/api/fx-backup", requireAuthenticatedUser, async (req, res) => {
  const backup = await getLatestFxRateBackup(req.userRecord.email, req.configRecord.spreadsheetId);
  res.json({ backup });
});

app.post("/api/expenses", requireAuthenticatedUser, requireEditAccess, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const values = req.body?.values;
    if (!Array.isArray(values)) {
      res.status(400).json({ message: "Expense row values are required." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: expenseMode, mapping: expenseMapping = null } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = expenseMode === "config-driven" ? expenseMapping : null;

    const report = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);
    const usdValidationError = validateUsdMandatory(values, report.sheetCurrencies);
    if (usdValidationError) {
      res.status(400).json({ message: usdValidationError });
      return;
    }

    const { record, insertMode } = await addExpenseRow(accessToken, req.configRecord.spreadsheetId, values, mapping);

    if (req.body?.fxRateBackup && typeof req.body.fxRateBackup === "object") {
      await saveFxRateBackup(req.userRecord.email, req.configRecord.spreadsheetId, req.body.fxRateBackup);
    }

    res.status(201).json({ record, insertMode });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.put("/api/expenses/:rowNumber", requireAuthenticatedUser, requireEditAccess, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const rowNumber = parseInt(req.params.rowNumber, 10);
    if (isNaN(rowNumber) || rowNumber < 2) {
      res.status(400).json({ message: "rowNumber must be an integer >= 2." });
      return;
    }

    const values = req.body?.values;
    if (!Array.isArray(values)) {
      res.status(400).json({ message: "Expense row values are required." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: expenseMode, mapping: expenseMapping = null } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = expenseMode === "config-driven" ? expenseMapping : null;

    const report = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);
    const usdValidationError = validateUsdMandatory(values, report.sheetCurrencies);
    if (usdValidationError) {
      res.status(400).json({ message: usdValidationError });
      return;
    }

    const { record, moveMode } = await moveExpenseRow(accessToken, req.configRecord.spreadsheetId, rowNumber, values, mapping);

    if (req.body?.fxRateBackup && typeof req.body.fxRateBackup === "object") {
      await saveFxRateBackup(req.userRecord.email, req.configRecord.spreadsheetId, req.body.fxRateBackup);
    }

    res.status(200).json({ record, moveMode });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete("/api/expenses/last", requireAuthenticatedUser, requireEditAccess, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const expectedRowCount = req.body?.expectedRowCount;
    if (typeof expectedRowCount !== "number" || !Number.isInteger(expectedRowCount) || expectedRowCount < 0) {
      res.status(400).json({ message: "expectedRowCount must be a non-negative integer." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    await deleteLastExpenseRow(accessToken, req.configRecord.spreadsheetId, expectedRowCount);
    res.status(204).end();
  } catch (error) {
    const status = error.code === "CONFLICT" ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
});

// ─── Sheet Structure Management ───────────────────────────────────────────────

app.post("/api/sheet/currency", requireAuthenticatedUser, requireOwner, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
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
    const result = await insertCurrencyColumnInSheet(accessToken, req.configRecord.spreadsheetId, code);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.post("/api/sheet/column", requireAuthenticatedUser, requireOwner, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Connect a spreadsheet first." });
      return;
    }

    const name = String(req.body?.name ?? "").trim();

    // Read current structure to validate against existing names
    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);

    if (report.customColumns.length >= MAX_CUSTOM_COLUMNS) {
      res.status(400).json({ message: `You can have at most ${MAX_CUSTOM_COLUMNS} custom columns.` });
      return;
    }

    const nameError = validateColumnName(name, report.customColumns);
    if (nameError) {
      res.status(400).json({ message: nameError });
      return;
    }

    await insertCustomColumnInSheet(accessToken, req.configRecord.spreadsheetId, name);

    // Re-read to return updated structure
    const updated = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);
    res.status(201).json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.patch("/api/sheet/column/rename", requireAuthenticatedUser, requireOwner, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
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
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);
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

    const colIndex = await findColumnIndex(
      accessToken,
      req.configRecord.spreadsheetId,
      currentName,
      mapping,
    );
    if (colIndex === null) {
      res.status(404).json({ message: `Column "${currentName}" not found in sheet.` });
      return;
    }

    await renameColumnInSheet(accessToken, req.configRecord.spreadsheetId, colIndex, newName);
    await renameVisibilityEntry(req.configRecord.email, req.configRecord.spreadsheetId, currentName, newName);

    const updated = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);
    res.json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.put("/api/sheet/columns/reorder", requireAuthenticatedUser, requireOwner, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const orderedNames = req.body?.orderedNames;
    if (!Array.isArray(orderedNames) || !orderedNames.every((n) => typeof n === "string")) {
      res.status(400).json({ message: "orderedNames must be an array of strings." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);

    if (!hasExactItemSet(report.customColumns, orderedNames)) {
      res.status(400).json({ message: "orderedNames must contain all custom columns exactly once." });
      return;
    }

    await reorderCustomColumnsInSheet(accessToken, req.configRecord.spreadsheetId, orderedNames, mapping);

    const updated = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);
    res.json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.put("/api/sheet/currencies/reorder", requireAuthenticatedUser, requireOwner, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const orderedCodes = req.body?.orderedCodes;
    if (!Array.isArray(orderedCodes) || !orderedCodes.every((n) => typeof n === "string")) {
      res.status(400).json({ message: "orderedCodes must be an array of strings." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const report = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);

    if (!hasExactItemSet(report.sheetCurrencies, orderedCodes)) {
      res.status(400).json({ message: "orderedCodes must contain all currency columns exactly once." });
      return;
    }

    await reorderCurrencyColumnsInSheet(accessToken, req.configRecord.spreadsheetId, orderedCodes, mapping);

    const updated = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);
    res.json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.delete("/api/sheet/column", requireAuthenticatedUser, requireOwner, async (req, res) => {
  try {
    if (!req.configRecord.spreadsheetId) {
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
    const { mode: configMode, mapping: configMapping = null } = await detectConfigSheet(accessToken, req.configRecord.spreadsheetId);
    const mapping = configMode === "config-driven" ? configMapping : null;
    const colIndex = await findColumnIndex(accessToken, req.configRecord.spreadsheetId, name, mapping);
    if (colIndex === null) {
      res.status(404).json({ message: `Column "${name}" not found in sheet.` });
      return;
    }

    const empty = await isCustomColumnEmpty(accessToken, req.configRecord.spreadsheetId, colIndex);
    if (!empty) {
      res.status(409).json({
        message: "This column contains data and cannot be removed from the app. To delete it, remove the data first or delete the column directly in Google Sheets.",
      });
      return;
    }

    await deleteColumnFromSheet(accessToken, req.configRecord.spreadsheetId, colIndex);

    const updated = await validateSpreadsheet(accessToken, req.configRecord.spreadsheetId, mapping);
    res.json({ currencies: updated.sheetCurrencies, customColumns: updated.customColumns });
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

// ─── Setup Sharing ────────────────────────────────────────────────────────────

app.get("/api/sharing", requireAuthenticatedUser, requireOwner, async (req, res) => {
  try {
    const shares = await listSharesForOwner(req.userRecord.email);
    res.json({ shares });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/sharing", requireAuthenticatedUser, requireOwner, async (req, res) => {
  const guestEmail = String(req.body?.guestEmail ?? "").trim().toLowerCase();
  const accessLevel = String(req.body?.accessLevel ?? "").trim();

  if (!guestEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    res.status(400).json({ message: "A valid Gmail address is required." });
    return;
  }
  if (!["view", "edit"].includes(accessLevel)) {
    res.status(400).json({ message: "accessLevel must be 'view' or 'edit'." });
    return;
  }
  if (guestEmail === req.userRecord.email) {
    res.status(400).json({ message: "You cannot share your setup with your own account." });
    return;
  }

  try {
    const alreadyHasSetup = await hasOwnIndependentSetup(guestEmail);
    if (alreadyHasSetup) {
      res.status(409).json({
        message: "This user already has their own setup configured. They need to unlink their sheet first before you can share yours with them.",
        code: "GUEST_HAS_OWN_SETUP",
      });
      return;
    }

    await addShare(req.userRecord.email, guestEmail, accessLevel);

    const ownerName = req.session.userFullName ?? req.session.userGivenName ?? req.userRecord.email;
    sendShareGrantedEmail({ ownerEmail: req.userRecord.email, ownerName, guestEmail });

    res.status(201).json({ guestEmail, accessLevel });
  } catch (error) {
    if (error.code === "23505") {
      res.status(409).json({ message: "This user is already in your share list." });
      return;
    }
    res.status(500).json({ message: error.message });
  }
});

app.patch("/api/sharing/:guestEmail", requireAuthenticatedUser, requireOwner, async (req, res) => {
  const guestEmail = String(req.params.guestEmail ?? "").trim().toLowerCase();
  const accessLevel = String(req.body?.accessLevel ?? "").trim();

  if (!["view", "edit"].includes(accessLevel)) {
    res.status(400).json({ message: "accessLevel must be 'view' or 'edit'." });
    return;
  }

  try {
    const updated = await updateShareAccessLevel(req.userRecord.email, guestEmail, accessLevel);
    if (!updated) {
      res.status(404).json({ message: "Share not found." });
      return;
    }
    res.json({ guestEmail, accessLevel });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete("/api/sharing/:guestEmail", requireAuthenticatedUser, requireOwner, async (req, res) => {
  const guestEmail = String(req.params.guestEmail ?? "").trim().toLowerCase();

  try {
    await removeShare(req.userRecord.email, guestEmail);
    sendShareRevokedEmail({ ownerEmail: req.userRecord.email, guestEmail });
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/sharing/guest/reset", requireAuthenticatedUser, requireGuest, async (req, res) => {
  try {
    await removeShareAsGuest(req.userRecord.email);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: error.message });
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
