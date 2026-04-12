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
import {
  appendExpenseRow,
  loadExpenses,
  parseSpreadsheetUrl,
  validateSpreadsheet,
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
import { getUserRecord, updateUserRecord, saveFxRateBackup, getLatestFxRateBackup } from "./store.js";
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

  res.json({
    config: {
      email: userRecord.email,
      spreadsheetId: userRecord.spreadsheetId,
      spreadsheetUrl: userRecord.spreadsheetUrl,
      sheetName: "Expenses",
    },
  });
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

app.get("/api/expenses", requireAuthenticatedUser, async (req, res) => {
  try {
    if (!req.userRecord.spreadsheetId) {
      res.status(400).json({ message: "Spreadsheet is not configured." });
      return;
    }

    const accessToken = await getAuthorizedAccessToken(req.userRecord);
    const snapshot = await loadExpenses(accessToken, req.userRecord.spreadsheetId);
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
    await appendExpenseRow(accessToken, req.userRecord.spreadsheetId, values);

    if (req.body?.fxRateBackup && typeof req.body.fxRateBackup === "object") {
      await saveFxRateBackup(req.userRecord.email, req.userRecord.spreadsheetId, req.body.fxRateBackup);
    }

    res.status(204).end();
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
