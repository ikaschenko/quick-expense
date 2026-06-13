// @vitest-environment node
import {
  checkDatabaseHealth,
  createGracefulShutdown,
  createRequireAuthenticatedUser,
  createShutdownGuard,
  destroySession,
  requireEditAccess,
  requireGuest,
  requireOwner,
} from "../server/resilience.js";

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
    const userRecord = { email: "user@test.com" };
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => ({ email: "user@test.com" }),
      getUserRecord: vi.fn().mockResolvedValue(userRecord),
      getShareForGuest: vi.fn().mockResolvedValue(null),
    });
    const req = { session: {} };
    const res = createResponseRecorder();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.userRecord).toEqual(userRecord);
    expect(req.configRecord).toEqual(userRecord);
    expect(req.isGuest).toBe(false);
    expect(req.accessLevel).toBe("edit");
    expect(next).toHaveBeenCalledOnce();
  });

  it("resolves guest: sets configRecord to owner and accessLevel from share", async () => {
    const guestRecord = { email: "guest@test.com" };
    const ownerRecord = { email: "owner@test.com", spreadsheetId: "sheet1" };
    const getUserRecord = vi.fn()
      .mockResolvedValueOnce(guestRecord)   // first call: guest
      .mockResolvedValueOnce(ownerRecord);  // second call: owner
    const middleware = createRequireAuthenticatedUser({
      getUserSession: () => ({ email: "guest@test.com" }),
      getUserRecord,
      getShareForGuest: vi.fn().mockResolvedValue({ ownerEmail: "owner@test.com", accessLevel: "view" }),
    });
    const req = { session: {} };
    const res = createResponseRecorder();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(req.userRecord).toEqual(guestRecord);
    expect(req.configRecord).toEqual(ownerRecord);
    expect(req.isGuest).toBe(true);
    expect(req.accessLevel).toBe("view");
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

    expect(destroySessionState).toHaveBeenCalledWith(req.session, "Failed to clear stale authenticated session.", console);
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
    const logger = { log: vi.fn((message) => steps.push(message)), error: vi.fn() };
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