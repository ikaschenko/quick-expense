// @vitest-environment node
import {
  checkDatabaseHealth,
  createErrorHandler,
  createGracefulShutdown,
  createRequireAuthenticatedUser,
  createRequireIdentityAuthenticatedUser,
  createShutdownGuard,
  destroySession,
  getClientErrorStatus,
  requireAppAdmin,
  requireEditAccess,
  requireGuest,
  requireOwner,
} from "../../app-server/resilience.js";
import winstonLogger from "../../app-server/logger.js";
import { getContext, runWithContext } from "../../app-server/request-context.js";

describe("destroySession", () => {
  it("resolves when the session destroy callback succeeds", async () => {
    const sessionState = {
      destroy: vi.fn((callback) => callback()),
    };

    await expect(destroySession(sessionState)).resolves.toBeUndefined();
    expect(sessionState.destroy).toHaveBeenCalledOnce();
  });

  it("rejects when the session destroy callback fails", async () => {
    const error = new Error("destroy failed");
    const sessionState = {
      destroy: vi.fn((callback) => callback(error)),
    };

    await expect(destroySession(sessionState)).rejects.toThrow("destroy failed");
  });
});

describe("createRequireAuthenticatedUser", () => {
  function createResponseRecorder() {
    return {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
  }

  it("returns 401 when no session user exists", async () => {
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => null,
      getUserRecord: vi.fn(),
      getShareForGuest: vi.fn().mockResolvedValue(null),
    });
    const res = createResponseRecorder();
    const next = vi.fn();

    await middleware({ session: {} }, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: "Please sign in to continue." });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the user record and calls next when the session is valid (no share)", async () => {
    const userRecord = { id: 7, email: "user@test.com" };
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => ({ email: "user@test.com" }),
      getUserRecord: vi.fn().mockResolvedValue(userRecord),
      getShareForGuest: vi.fn().mockResolvedValue(null),
    });
    const req = { session: {} };
    const res = createResponseRecorder();
    const next = vi.fn();

    let observedContext;
    await runWithContext({ userId: 0, ownerUserId: null }, async () => {
      await middleware(req, res, next);
      observedContext = getContext();
    });

    expect(req.userRecord).toEqual(userRecord);
    expect(req.configRecord).toEqual(userRecord);
    expect(req.isGuest).toBe(false);
    expect(req.accessLevel).toBe("edit");
    expect(observedContext).toMatchObject({ userId: 7, ownerUserId: null });
    expect(next).toHaveBeenCalledOnce();
  });

  it("resolves guest: sets configRecord to owner and accessLevel from share", async () => {
    const guestRecord = { id: 7, email: "guest@test.com" };
    const ownerRecord = { id: 3, email: "owner@test.com", spreadsheetId: "sheet1" };
    const getUserRecord = vi.fn()
      .mockResolvedValueOnce(guestRecord)   // first call: guest
      .mockResolvedValueOnce(ownerRecord);  // second call: owner
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => ({ email: "guest@test.com" }),
      getUserRecord,
      getShareForGuest: vi.fn().mockResolvedValue({ ownerEmail: "owner@test.com", ownerUserId: 3, accessLevel: "view" }),
    });
    const req = { session: {} };
    const res = createResponseRecorder();
    const next = vi.fn();

    let observedGuestContext;
    await runWithContext({ userId: 0, ownerUserId: null }, async () => {
      await middleware(req, res, next);
      observedGuestContext = getContext();
    });

    expect(req.userRecord).toEqual(guestRecord);
    expect(req.configRecord).toEqual(ownerRecord);
    expect(req.isGuest).toBe(true);
    expect(req.accessLevel).toBe("view");
    expect(observedGuestContext).toMatchObject({ userId: 7, ownerUserId: 3 });
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 SHARED_CONFIG_INVALID when owner has no spreadsheetId", async () => {
    const guestRecord = { email: "guest@test.com" };
    const ownerRecord = { email: "owner@test.com", spreadsheetId: null };
    const getUserRecord = vi.fn()
      .mockResolvedValueOnce(guestRecord)
      .mockResolvedValueOnce(ownerRecord);
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => ({ email: "guest@test.com" }),
      getUserRecord,
      getShareForGuest: vi.fn().mockResolvedValue({ ownerEmail: "owner@test.com", accessLevel: "edit" }),
    });
    const res = createResponseRecorder();
    const next = vi.fn();

    await middleware({ session: {} }, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SHARED_CONFIG_INVALID");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 SHARED_CONFIG_INVALID when owner record is missing", async () => {
    const guestRecord = { email: "guest@test.com" };
    const getUserRecord = vi.fn()
      .mockResolvedValueOnce(guestRecord)
      .mockResolvedValueOnce(null);    // owner deleted
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => ({ email: "guest@test.com" }),
      getUserRecord,
      getShareForGuest: vi.fn().mockResolvedValue({ ownerEmail: "owner@test.com", accessLevel: "edit" }),
    });
    const res = createResponseRecorder();
    const next = vi.fn();

    await middleware({ session: {} }, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("SHARED_CONFIG_INVALID");
    expect(next).not.toHaveBeenCalled();
  });

  it("clears the stale session and returns 401 when the stored user record is missing", async () => {
    const destroySessionState = vi.fn().mockResolvedValue(undefined);
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => ({ email: "user@test.com" }),
      getUserRecord: vi.fn().mockResolvedValue(null),
      getShareForGuest: vi.fn().mockResolvedValue(null),
      destroySessionState,
    });
    const req = { session: { destroy: vi.fn() } };
    const res = createResponseRecorder();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(destroySessionState).toHaveBeenCalledWith(req.session, "Failed to clear stale authenticated session.", winstonLogger);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: "Stored session is no longer available. Please sign in again." });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 500 when user lookup fails", async () => {
    const logger = { error: vi.fn() };
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => ({ email: "user@test.com" }),
      getUserRecord: vi.fn().mockRejectedValue(new Error("db down")),
      getShareForGuest: vi.fn().mockResolvedValue(null),
      logger,
    });
    const res = createResponseRecorder();
    const next = vi.fn();

    await middleware({ session: {} }, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: "Unable to verify your session right now. Please try again." });
    expect(logger.error).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireOwner", () => {
  it("calls next when the user is not a guest", () => {
    const req = { isGuest: false };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireOwner(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 GUEST_CANNOT_MODIFY_CONFIG when the user is a guest", () => {
    const req = { isGuest: true };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "GUEST_CANNOT_MODIFY_CONFIG" }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireGuest", () => {
  it("calls next when the user is a guest", () => {
    const req = { isGuest: true };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireGuest(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 when the user is not a guest", () => {
    const req = { isGuest: false };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireGuest(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireEditAccess", () => {
  it("calls next when accessLevel is edit", () => {
    const req = { accessLevel: "edit" };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireEditAccess(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 ACCESS_DENIED when accessLevel is view", () => {
    const req = { accessLevel: "view" };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireEditAccess(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "ACCESS_DENIED" }));
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireAppAdmin", () => {
  const originalAdminEmail = process.env.ADMIN_EMAIL;
  const originalAlertEmailTo = process.env.ALERT_EMAIL_TO;

  afterEach(() => {
    process.env.ADMIN_EMAIL = originalAdminEmail;
    process.env.ALERT_EMAIL_TO = originalAlertEmailTo;
  });

  it("calls next when the user's email matches ADMIN_EMAIL", () => {
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ALERT_EMAIL_TO = "";
    const req = { userRecord: { email: "Admin@Test.com" } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAppAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next when the user's email matches one entry in a comma/semicolon-separated ALERT_EMAIL_TO", () => {
    process.env.ADMIN_EMAIL = "";
    process.env.ALERT_EMAIL_TO = "first@test.com,second@test.com;third@test.com";
    const req = { userRecord: { email: "second@test.com" } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAppAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 when the user's email is in neither ADMIN_EMAIL nor ALERT_EMAIL_TO", () => {
    process.env.ADMIN_EMAIL = "admin@test.com";
    process.env.ALERT_EMAIL_TO = "alert@test.com";
    const req = { userRecord: { email: "stranger@test.com" } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAppAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin access required." });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when both env vars are unset", () => {
    process.env.ADMIN_EMAIL = "";
    process.env.ALERT_EMAIL_TO = "";
    const req = { userRecord: { email: "admin@test.com" } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAppAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when there is no authenticated user record", () => {
    process.env.ADMIN_EMAIL = "admin@test.com";
    const req = {};
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAppAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("checkDatabaseHealth", () => {
  it("returns ok when the database probe succeeds", async () => {
    const dbPool = { query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }) };

    await expect(checkDatabaseHealth(dbPool)).resolves.toEqual({
      ok: true,
      checks: { db: "up" },
    });
    expect(dbPool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns unhealthy when the database probe fails", async () => {
    const dbPool = { query: vi.fn().mockRejectedValue(new Error("offline")) };

    await expect(checkDatabaseHealth(dbPool)).resolves.toEqual({
      ok: false,
      checks: { db: "down" },
    });
  });
});

describe("getClientErrorStatus", () => {
  function uriError() {
    const error = new URIError("Failed to decode param '%%32'");
    error.status = 400;
    return error;
  }

  it.each([
    ["an Express URI-decoding error", uriError(), 400],
    ["a body-parser parse error", Object.assign(new SyntaxError("Unexpected token"), { status: 400, expose: true }), 400],
    ["a body-parser size error", Object.assign(new Error("request entity too large"), { statusCode: 413, expose: true }), 413],
    ["an upstream 403 (e.g. Google API) without expose", Object.assign(new Error("forbidden"), { status: 403 }), null],
    ["an exposed 5xx error", Object.assign(new Error("boom"), { status: 500, expose: true }), null],
    ["an error without status", new Error("boom"), null],
    ["a non-error value", "boom", null],
    ["null", null, null],
  ])("should map %s to %s", (_label, error, expected) => {
    expect(getClientErrorStatus(error)).toBe(expected);
  });
});

describe("createErrorHandler", () => {
  async function requestThrough(app, path) {
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
    try {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, path.startsWith("/api/json")
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" }
        : undefined);
      return { status: response.status, body: await response.text() };
    } finally {
      server.close();
    }
  }

  async function buildApp(logger) {
    const { default: express } = await import("express");
    const app = express();
    app.use("/api", express.json());
    app.post("/api/json", (_req, res) => res.json({ ok: true }));
    app.get("/api/upstream", () => {
      throw Object.assign(new Error("Google said no"), { status: 403 });
    });
    app.get("/api/item/:id", (req, res) => res.json({ id: req.params.id }));
    app.get("*", (_req, res) => res.send("spa"));
    app.use(createErrorHandler({ logger }));
    return app;
  }

  it("should answer 400 with a warn log (no error alert) for the malformed URI from the production alert", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const errorSpy = vi.spyOn(winstonLogger, "error").mockImplementation(() => {});

    const result = await requestThrough(await buildApp(logger), "/backend/%%32%65env");

    expect(result).toEqual({ status: 400, body: "Bad Request." });
    expect(logger.warn).toHaveBeenCalledWith("client_request_error", expect.objectContaining({
      event: "client_request_error",
      statusCode: 400,
      errorType: "URIError",
    }));
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("should answer 400 JSON for a malformed route param under /api", async () => {
    const logger = { warn: vi.fn() };

    const result = await requestThrough(await buildApp(logger), "/api/item/%E0%A4%A");

    expect(result).toEqual({ status: 400, body: JSON.stringify({ message: "Bad Request." }) });
  });

  it("should answer 400 JSON for a malformed JSON body", async () => {
    const logger = { warn: vi.fn() };

    const result = await requestThrough(await buildApp(logger), "/api/json");

    expect(result.status).toBe(400);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("should keep 503 and log an error alert with statusCode for an upstream 4xx under /api", async () => {
    const logger = { warn: vi.fn() };
    const errorSpy = vi.spyOn(winstonLogger, "error").mockImplementation(() => {});

    const result = await requestThrough(await buildApp(logger), "/api/upstream");

    expect(result.status).toBe(503);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("unhandled_request_error", expect.objectContaining({
      event: "unhandled_request_error",
      error: "Google said no",
      errorType: "Error",
      statusCode: 503,
    }));
    errorSpy.mockRestore();
  });

  it("should delegate to next when headers were already sent", () => {
    const logger = { warn: vi.fn() };
    const next = vi.fn();
    const error = new URIError("bad");
    error.status = 400;
    const res = { headersSent: true, status: vi.fn() };

    createErrorHandler({ logger })(error, { path: "/x" }, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("createShutdownGuard", () => {
  it("allows excluded health checks during shutdown", () => {
    const guard = createShutdownGuard({
      isShuttingDown: () => true,
      excludedPaths: ["/api/health"],
    });
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    guard({ path: "/api/health" }, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 503 for new requests during shutdown", () => {
    const guard = createShutdownGuard({
      isShuttingDown: () => true,
      excludedPaths: ["/api/health"],
    });
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    guard({ path: "/api/config" }, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ message: "Server is restarting. Please retry shortly." });
  });
});

describe("createGracefulShutdown", () => {
  it("closes the server and database, marks shutdown, and exits with code 0", async () => {
    const steps = [];
    const logger = { info: vi.fn((message) => steps.push(message)), error: vi.fn() };
    const onExit = vi.fn();
    const setShuttingDown = vi.fn((nextValue) => steps.push(`shutting:${nextValue}`));
    const server = {
      close: vi.fn((callback) => {
        steps.push("server.close");
        callback();
      }),
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
    };
    const closeDatabase = vi.fn(async () => {
      steps.push("db.close");
    });
    const shutdown = createGracefulShutdown({
      getServer: () => server,
      closeDatabase,
      setShuttingDown,
      logger,
      onExit,
      timeoutMs: 50,
    });

    await expect(shutdown("SIGTERM")).resolves.toBe(0);

    expect(setShuttingDown).toHaveBeenCalledWith(true);
    expect(server.close).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledWith(0);
    expect(steps).toEqual([
      "shutting:true",
      "Received SIGTERM. Starting graceful shutdown.",
      "server.close",
      "db.close",
      "Graceful shutdown complete.",
    ]);
  });
});

describe("identity-only authentication and normalized admin checks", () => {
  it("authenticates a user without resolving a shared setup", async () => {
    const userRecord = { id: 11, email: "admin@test.com", spreadsheetId: null };
    const middleware = createRequireIdentityAuthenticatedUser({
      getUserSession: () => ({ email: userRecord.email }),
      getUserRecord: async () => userRecord,
    });
    const req = { session: {} };
    const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    const next = vi.fn();
    await middleware(req, res, next);
    expect(req.userRecord).toEqual(userRecord);
    expect(req.configRecord).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it("matches ALERT_EMAIL_TO case-insensitively and denies access with no configured allow-list", () => {
    process.env.ADMIN_EMAIL = "";
    process.env.ALERT_EMAIL_TO = "Ops@Test.com;other@test.com";
    const next = vi.fn();
    const req = { userRecord: { email: " OPS@test.com " } };
    const res = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    requireAppAdmin(req, res, next);
    expect(req.isAppAdmin).toBe(true);
    expect(next).toHaveBeenCalledOnce();

    process.env.ALERT_EMAIL_TO = "";
    const denied = { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    requireAppAdmin({ userRecord: { email: "ops@test.com" } }, denied, vi.fn());
    expect(denied.statusCode).toBe(403);
  });
});
