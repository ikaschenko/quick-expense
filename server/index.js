import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import session from "express-session";
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
import { getUserRecord, updateUserRecord } from "./store.js";
import { createSessionStore } from "./session-store.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const sessionDir = path.resolve(process.cwd(), "config", "sessions");

function validateStartupEnv() {
  const missing = [];

  if (!getGoogleClientId()) {
    missing.push("GOOGLE_CLIENT_ID");
  }

  ["GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "FRONTEND_BASE_URL", "SESSION_SECRET"].forEach(
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

fs.mkdirSync(sessionDir, { recursive: true });

app.use(express.json());
app.use(
  session({
    store: createSessionStore({
      path: sessionDir,
      fileExtension: ".sess",
      retries: 2,
      minTimeout: 40,
      maxTimeout: 120,
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

async function requireAuthenticatedUser(req, res, next) {
  const sessionUser = getUserSession(req);
  if (!sessionUser) {
    res.status(401).json({ message: "Please sign in to continue." });
    return;
  }

  const userRecord = await getUserRecord(sessionUser.email);
  if (!userRecord) {
    req.session.destroy(() => undefined);
    res.status(401).json({ message: "Stored session is no longer available. Please sign in again." });
    return;
  }

  req.userRecord = userRecord;
  next();
}

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
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

    req.session.userEmail = userInfo.email;
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    res.redirect(`${getFrontendBaseUrl()}/home`);
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

  const userRecord = await getUserRecord(sessionUser.email);
  if (!userRecord) {
    req.session.destroy(() => undefined);
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
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).end();
  });
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
    await validateSpreadsheet(accessToken, spreadsheetId);

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
    });
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
  const backups = Array.isArray(req.userRecord.fxRateBackups) ? req.userRecord.fxRateBackups : [];
  const latestBackup = backups.find(
    (backup) =>
      backup &&
      typeof backup === "object" &&
      (!backup.spreadsheetId || backup.spreadsheetId === req.userRecord.spreadsheetId),
  ) ?? null;

  res.json({ backup: latestBackup });
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
      await updateUserRecord(req.userRecord.email, (current) => ({
        ...current,
        fxRateBackups: [
          {
            ...req.body.fxRateBackup,
            submittedAt: new Date().toISOString(),
            spreadsheetId: current.spreadsheetId,
          },
          ...(current.fxRateBackups ?? []),
        ].slice(0, 200),
      }));
    }

    res.status(204).end();
  } catch (error) {
    res.status(400).json({ message: (error).message });
  }
});

app.listen(port, () => {
  console.log(`QuickExpense backend listening on http://localhost:${port}`);
});
