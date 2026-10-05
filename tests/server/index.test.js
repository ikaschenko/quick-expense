// @vitest-environment node
const mocks = vi.hoisted(() => ({
  session: {},
  pool: { query: vi.fn(), end: vi.fn() },
  store: {
    getUserRecord: vi.fn(),
    updateUserRecord: vi.fn(),
    saveFxRateBackup: vi.fn(),
    getLatestFxRateBackup: vi.fn(),
    getHiddenColumns: vi.fn(),
    setColumnVisibility: vi.fn(),
    renameVisibilityEntry: vi.fn(),
    hasOwnIndependentSetup: vi.fn(),
    getSetupDefaults: vi.fn(),
    withSetupDefaultsLock: vi.fn(),
    writeSetupDefaults: vi.fn(),
    defaultsConflict: () => Object.assign(new Error("Reload defaults"), { status: 409, code: "DEFAULTS_CONFLICT" }),
  },
  sharing: {
    addShare: vi.fn(),
    getShareForGuest: vi.fn(),
    listSharesForOwner: vi.fn(),
    removeShare: vi.fn(),
    removeShareAsGuest: vi.fn(),
    updateShareAccessLevel: vi.fn(),
  },
  email: {
    sendShareGrantedEmail: vi.fn(),
    sendShareRevokedEmail: vi.fn(),
    sendErrorAlertEmail: vi.fn(),
    sendWarningDigestEmail: vi.fn(),
  },
  logs: {
    listLogFiles: vi.fn(),
    readLogEntries: vi.fn(),
  },
  sheets: {
    createSpreadsheet: vi.fn(),
    detectConfigSheet: vi.fn(),
    validateSpreadsheet: vi.fn(),
    findColumnIndex: vi.fn(),
    renameColumnInSheet: vi.fn(),
    isCustomColumnEmpty: vi.fn(),
    deleteColumnFromSheet: vi.fn(),
    insertCustomColumnInSheet: vi.fn(),
  },
}));

vi.mock("express-session", () => ({
  default: () => (req, _res, next) => {
    req.session = mocks.session;
    next();
  },
}));
vi.mock("connect-pg-simple", () => ({ default: () => class MockPgStore {} }));
vi.mock("express-rate-limit", () => ({ default: () => (_req, _res, next) => next() }));
vi.mock("../../app-server/db.js", () => ({ default: mocks.pool }));
vi.mock("../../app-server/store.js", () => mocks.store);
vi.mock("../../app-server/sharing.js", () => mocks.sharing);
vi.mock("../../app-server/email.js", () => mocks.email);
vi.mock("../../app-server/google-sheets.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ...mocks.sheets,
}));
vi.mock("../../app-server/logger.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ...mocks.logs,
  startWarningDigestScheduler: vi.fn(),
}));

const OWNER = { id: 1, email: "owner@test.com", spreadsheetId: "sheet-1", spreadsheetUrl: "https://sheet" };
const GUEST = { id: 2, email: "guest@test.com", spreadsheetId: null };
const ADMIN = { id: 3, email: "admin@test.com", spreadsheetId: null };
const USERS = { [OWNER.email]: OWNER, [GUEST.email]: GUEST, [ADMIN.email]: ADMIN };

let server;
let baseUrl;

beforeAll(async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_REDIRECT_URI", "http://localhost/callback");
  vi.stubEnv("GOOGLE_API_KEY", "api-key");
  vi.stubEnv("FRONTEND_BASE_URL", "http://localhost:5173");
  vi.stubEnv("SESSION_SECRET", "test-secret");
  vi.stubEnv("DATABASE_URL", "postgres://localhost/test");
  vi.stubEnv("ADMIN_EMAIL", ADMIN.email);
  vi.stubEnv("ALERT_EMAIL_TO", "");

  const { app } = await import("../../app-server/index.js");
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of Object.keys(mocks.session)) delete mocks.session[key];
  mocks.session.destroy = vi.fn((cb) => cb());
  mocks.store.getUserRecord.mockImplementation(async (email) => USERS[email] ?? null);
  mocks.sharing.getShareForGuest.mockResolvedValue(null);
  mocks.store.getSetupDefaults.mockResolvedValue({ version: "2", values: { "Spent For": "Family" } });
  mocks.store.withSetupDefaultsLock.mockImplementation(async (_owner, _sheet, action) => action({}, { version: "2", values: { "Spent For": "Family" } }));
  mocks.store.writeSetupDefaults.mockImplementation(async (_client, _owner, values) => ({ version: "3", values }));
});

describe("shared defaults API", () => {
  beforeEach(() => {
    mocks.sheets.detectConfigSheet.mockResolvedValue({ mode: "default" });
    mocks.sheets.validateSpreadsheet.mockResolvedValue({ customColumns: ["Theme", "__proto__"] });
    mocks.store.getUserRecord.mockImplementation(async (email) => {
      const user = USERS[email];
      return user ? { ...user, accessToken: "token", accessTokenExpiresAt: Date.now() + 3600000 } : null;
    });
  });

  it("lets view guests read the owner's defaults", async () => {
    signInAsGuest("view");
    const result = await request("GET", "/api/config/defaults");
    expect(result).toMatchObject({ status: 200, body: { version: "2", values: { "Spent For": "Family" } } });
    expect(mocks.store.withSetupDefaultsLock).toHaveBeenCalledWith(OWNER.id, OWNER.spreadsheetId, expect.any(Function));
  });

  it("returns unchanged for a matching version", async () => {
    signInAs(OWNER);
    expect((await request("GET", "/api/config/defaults?version=2")).body).toEqual({ unchanged: true, version: "2" });
  });

  it.each(["Spent For", "Theme", "__proto__"])("lets edit guests save %s on the owner's setup", async (field) => {
    signInAsGuest();
    const result = await request("PATCH", "/api/config/defaults", { body: { field, value: " Vacation ", expectedVersion: "2" } });
    expect(result.status).toBe(200);
    expect(Object.hasOwn(result.body.values, field)).toBe(true);
    expect(result.body.values[field]).toBe("Vacation");
    expect(mocks.store.writeSetupDefaults.mock.calls[0][1]).toBe(OWNER.id);
  });

  it("clears a default without deleting its version", async () => {
    signInAs(OWNER);
    const result = await request("PATCH", "/api/config/defaults", { body: { field: "Spent For", value: null, expectedVersion: "2" } });
    expect(result.body).toEqual({ version: "3", values: {} });
  });

  it.each([
    { field: "Theme", value: " ", expectedVersion: "2" },
    { field: "Theme", value: 1, expectedVersion: "2" },
    { field: "Theme", value: "x", expectedVersion: 2 },
    { field: "Theme", value: "x", expectedVersion: "9223372036854775808" },
    { field: "Category", value: "x", expectedVersion: "2" },
    { field: "Theme", value: "x", expectedVersion: "2", ownerUserId: 9 },
  ])("rejects malformed or ineligible input %j", async (body) => {
    signInAs(OWNER);
    expect((await request("PATCH", "/api/config/defaults", { body })).status).toBe(400);
    expect(mocks.store.writeSetupDefaults).not.toHaveBeenCalled();
  });

  it("rejects stale changes before writing", async () => {
    signInAs(OWNER);
    const result = await request("PATCH", "/api/config/defaults", { body: { field: "Theme", value: "x", expectedVersion: "1" } });
    expect(result).toMatchObject({ status: 409, body: { code: "DEFAULTS_CONFLICT" } });
    expect(mocks.store.writeSetupDefaults).not.toHaveBeenCalled();
  });

  it("rejects view guests and requests without CSRF", async () => {
    signInAsGuest("view");
    const body = { field: "Theme", value: "x", expectedVersion: "2" };
    expect((await request("PATCH", "/api/config/defaults", { body })).status).toBe(403);
    signInAs(OWNER);
    expect((await request("PATCH", "/api/config/defaults", { body, csrf: false })).status).toBe(403);
    expect(mocks.store.writeSetupDefaults).not.toHaveBeenCalled();
  });

  it("prunes obsolete columns on read and advances the version", async () => {
    signInAs(OWNER);
    mocks.store.withSetupDefaultsLock.mockImplementationOnce(async (_owner, _sheet, action) => action({}, { version: "2", values: { Deleted: "Old", Theme: "Vacation" } }));
    const result = await request("GET", "/api/config/defaults?version=2");
    expect(result.body).toEqual({ version: "3", values: { Theme: "Vacation" } });
  });

  it("preserves a renamed field's default under the setup lock", async () => {
    signInAs(OWNER);
    mocks.store.withSetupDefaultsLock.mockImplementationOnce(async (_owner, _sheet, action) => action({}, { version: "2", values: { Theme: "Vacation" } }));
    mocks.sheets.validateSpreadsheet.mockResolvedValueOnce({ sheetCurrencies: [], customColumns: ["Theme"] }).mockResolvedValueOnce({ sheetCurrencies: [], customColumns: ["Trip"] });
    mocks.sheets.findColumnIndex.mockResolvedValue(6);
    const result = await request("PATCH", "/api/sheet/column/rename", { body: { currentName: "Theme", newName: "Trip" } });
    expect(result.status).toBe(200);
    expect(mocks.store.writeSetupDefaults).toHaveBeenCalledWith({}, OWNER.id, { Trip: "Vacation" });
  });

  it("discards a removed column's default", async () => {
    signInAs(OWNER);
    mocks.store.withSetupDefaultsLock.mockImplementationOnce(async (_owner, _sheet, action) => action({}, { version: "2", values: { Theme: "Vacation", "Spent For": "Family" } }));
    mocks.sheets.validateSpreadsheet.mockResolvedValue({ sheetCurrencies: [], customColumns: [] });
    mocks.sheets.findColumnIndex.mockResolvedValue(6);
    mocks.sheets.isCustomColumnEmpty.mockResolvedValue(true);
    const result = await request("DELETE", "/api/sheet/column", { body: { name: "Theme" } });
    expect(result.status).toBe(200);
    expect(mocks.store.writeSetupDefaults).toHaveBeenCalledWith({}, OWNER.id, { "Spent For": "Family" });
  });

  it("reports partial failure rather than claiming a rename succeeded", async () => {
    signInAs(OWNER);
    mocks.sheets.validateSpreadsheet.mockResolvedValue({ sheetCurrencies: [], customColumns: ["Theme"] });
    mocks.sheets.findColumnIndex.mockResolvedValue(6);
    mocks.store.writeSetupDefaults.mockRejectedValueOnce(new Error("database failed"));
    expect((await request("PATCH", "/api/sheet/column/rename", { body: { currentName: "Theme", newName: "Trip" } })).status).not.toBe(200);
    expect(mocks.sheets.renameColumnInSheet).toHaveBeenCalled();
  });

  it("does not let edit guests rename or remove sheet columns", async () => {
    signInAsGuest();
    expect((await request("PATCH", "/api/sheet/column/rename", { body: { currentName: "Theme", newName: "Trip" } })).status).toBe(403);
    expect((await request("DELETE", "/api/sheet/column", { body: { name: "Theme" } })).status).toBe(403);
    expect(mocks.store.writeSetupDefaults).not.toHaveBeenCalled();
  });

  it("never lets a recreated column inherit a leftover default", async () => {
    signInAs(OWNER);
    mocks.store.withSetupDefaultsLock.mockImplementationOnce(async (_owner, _sheet, action) => action({}, { version: "2", values: { Theme: "Old" } }));
    mocks.sheets.validateSpreadsheet.mockResolvedValueOnce({ sheetCurrencies: [], customColumns: [] }).mockResolvedValueOnce({ sheetCurrencies: [], customColumns: ["Theme"] });
    expect((await request("POST", "/api/sheet/column", { body: { name: "Theme" } })).status).toBe(201);
    expect(mocks.store.writeSetupDefaults).toHaveBeenCalledWith({}, OWNER.id, {});
  });
});

function signInAs(user) {
  mocks.session.userEmail = user.email;
  mocks.session.userGivenName = "Test";
}

function signInAsGuest(accessLevel = "edit") {
  signInAs(GUEST);
  mocks.sharing.getShareForGuest.mockImplementation(async (email) =>
    email === GUEST.email ? { ownerEmail: OWNER.email, accessLevel } : null,
  );
}

async function request(method, path, { body, csrf = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (csrf) headers["X-Requested-With"] = "fetch";
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("GET /api/health", () => {
  it("should return 200 when the database responds", async () => {
    mocks.pool.query.mockResolvedValue({ rows: [] });

    const res = await request("GET", "/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, checks: { db: "up", shutdown: "ready" } });
  });

  it("should return 503 when the database is down", async () => {
    mocks.pool.query.mockRejectedValue(new Error("down"));

    const res = await request("GET", "/api/health");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ ok: false, checks: { db: "down" } });
  });
});

describe("CSRF guard", () => {
  it("should reject a mutating request without X-Requested-With", async () => {
    signInAs(OWNER);

    const res = await request("POST", "/api/sharing", { body: {}, csrf: false });

    expect(res.status).toBe(403);
    expect(mocks.sharing.addShare).not.toHaveBeenCalled();
  });
});

describe("requireAuthenticatedUser", () => {
  it("should return 401 when there is no session user", async () => {
    const res = await request("GET", "/api/sharing");

    expect(res.status).toBe(401);
  });

  it("should return 401 and destroy the session when the stored user is gone", async () => {
    mocks.session.userEmail = "ghost@test.com";

    const res = await request("GET", "/api/sharing");

    expect(res.status).toBe(401);
    expect(mocks.session.destroy).toHaveBeenCalled();
  });

  it("should return 403 SHARED_CONFIG_INVALID when the guest's owner has no spreadsheet", async () => {
    signInAsGuest();
    mocks.store.getUserRecord.mockImplementation(async (email) =>
      email === OWNER.email ? { ...OWNER, spreadsheetId: null } : USERS[email] ?? null,
    );

    const res = await request("GET", "/api/config");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SHARED_CONFIG_INVALID");
  });

  it("should return 500 when the user lookup fails", async () => {
    signInAs(OWNER);
    mocks.store.getUserRecord.mockRejectedValue(new Error("db down"));

    const res = await request("GET", "/api/sharing");

    expect(res.status).toBe(500);
  });
});

describe("GET /api/auth/session", () => {
  it("should report unauthenticated when there is no session user", async () => {
    const res = await request("GET", "/api/auth/session");

    expect(res.body).toEqual({ authenticated: false });
  });

  it("should report unauthenticated and clear the session when the stored user is gone", async () => {
    mocks.session.userEmail = "ghost@test.com";

    const res = await request("GET", "/api/auth/session");

    expect(res.body).toEqual({ authenticated: false });
    expect(mocks.session.destroy).toHaveBeenCalled();
  });

  it("should describe an owner session", async () => {
    signInAs(OWNER);

    const res = await request("GET", "/api/auth/session");

    expect(res.body.authenticated).toBe(true);
    expect(res.body.session).toMatchObject({ email: OWNER.email, isGuest: false, guestAccessLevel: null, configStatus: "ok" });
  });

  it("should describe a guest session with the owner's config status", async () => {
    signInAsGuest("view");

    const res = await request("GET", "/api/auth/session");

    expect(res.body.session).toMatchObject({
      isGuest: true,
      guestAccessLevel: "view",
      ownerEmail: OWNER.email,
      configStatus: "ok",
    });
  });

  it("should flag shared_config_invalid when the owner has no spreadsheet", async () => {
    signInAsGuest();
    mocks.store.getUserRecord.mockImplementation(async (email) =>
      email === OWNER.email ? { ...OWNER, spreadsheetId: null } : USERS[email] ?? null,
    );

    const res = await request("GET", "/api/auth/session");

    expect(res.body.session.configStatus).toBe("shared_config_invalid");
  });

  it("should return 500 when the lookup fails", async () => {
    signInAs(OWNER);
    mocks.store.getUserRecord.mockRejectedValue(new Error("db down"));

    const res = await request("GET", "/api/auth/session");

    expect(res.status).toBe(500);
  });
});

describe("POST /api/auth/logout", () => {
  it("should destroy the session and return 204", async () => {
    signInAs(OWNER);

    const res = await request("POST", "/api/auth/logout");

    expect(res.status).toBe(204);
    expect(mocks.session.destroy).toHaveBeenCalled();
  });

  it("should return 500 when the session cannot be destroyed", async () => {
    mocks.session.destroy = vi.fn((cb) => cb(new Error("store down")));

    const res = await request("POST", "/api/auth/logout");

    expect(res.status).toBe(500);
  });
});

describe("GET /api/config", () => {
  it("should return a null config when no spreadsheet is configured", async () => {
    signInAs(ADMIN);

    const res = await request("GET", "/api/config");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ config: null });
  });
});

describe("PATCH /api/config/column-visibility", () => {
  it("should return 400 when no spreadsheet is configured", async () => {
    signInAs(ADMIN);

    const res = await request("PATCH", "/api/config/column-visibility", { body: { field: "Notes", hidden: true } });

    expect(res.status).toBe(400);
  });

  it.each([
    ["an empty field", { field: "", hidden: true }],
    ["a field longer than 30 characters", { field: "x".repeat(31), hidden: true }],
    ["a non-boolean hidden flag", { field: "Notes", hidden: "yes" }],
    ["a mandatory field", { field: "Date", hidden: true }],
  ])("should return 400 for %s", async (_label, body) => {
    signInAs(OWNER);

    const res = await request("PATCH", "/api/config/column-visibility", { body });

    expect(res.status).toBe(400);
    expect(mocks.store.setColumnVisibility).not.toHaveBeenCalled();
  });

  it("should save the visibility and return the hidden columns", async () => {
    signInAs(OWNER);
    mocks.store.getHiddenColumns.mockResolvedValue(["Notes"]);

    const res = await request("PATCH", "/api/config/column-visibility", { body: { field: "Notes", hidden: true } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hiddenColumns: ["Notes"] });
    expect(mocks.store.setColumnVisibility).toHaveBeenCalledWith(OWNER.id, OWNER.spreadsheetId, "Notes", true);
  });

  it("should return 500 when saving fails", async () => {
    signInAs(OWNER);
    mocks.store.setColumnVisibility.mockRejectedValue(new Error("db down"));

    const res = await request("PATCH", "/api/config/column-visibility", { body: { field: "Notes", hidden: true } });

    expect(res.status).toBe(500);
  });

  it("should return 403 for a guest", async () => {
    signInAsGuest();

    const res = await request("PATCH", "/api/config/column-visibility", { body: { field: "Notes", hidden: true } });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GUEST_CANNOT_MODIFY_CONFIG");
  });
});

describe("POST /api/config and /api/config/create-spreadsheet", () => {
  const NEW_URL = "https://docs.google.com/spreadsheets/d/new-sheet-id/edit";
  const REPORT = { sheetCurrencies: ["EUR"], customColumns: ["Notes"], tabAction: "found", headersAction: "valid" };

  beforeEach(() => {
    const owner = { ...OWNER, accessToken: "token", accessTokenExpiresAt: Date.now() + 3_600_000 };
    mocks.store.getUserRecord.mockImplementation(async (email) => (email === OWNER.email ? owner : USERS[email] ?? null));
    mocks.store.updateUserRecord.mockImplementation(async (_email, updater) => updater(owner));
    mocks.sheets.detectConfigSheet.mockResolvedValue({ mode: "default" });
    mocks.sheets.validateSpreadsheet.mockResolvedValue(REPORT);
    mocks.sheets.createSpreadsheet.mockResolvedValue({ spreadsheetId: "created-id", spreadsheetUrl: NEW_URL });
  });

  it("should return a complete config with stored hidden columns when connecting a sheet", async () => {
    signInAs(OWNER);
    mocks.store.getHiddenColumns.mockResolvedValue(["Notes"]);

    const res = await request("POST", "/api/config", { body: { spreadsheetUrl: NEW_URL } });

    expect(res.status).toBe(200);
    expect(res.body.config).toMatchObject({
      spreadsheetId: "new-sheet-id",
      hiddenColumns: ["Notes"],
      isGuest: false,
      accessLevel: "edit",
      ownerEmail: null,
    });
    expect(mocks.store.getHiddenColumns).toHaveBeenCalledWith(OWNER.id, "new-sheet-id");
  });

  it("should return a complete config with no hidden columns when creating a sheet", async () => {
    signInAs(OWNER);

    const res = await request("POST", "/api/config/create-spreadsheet", { body: {} });

    expect(res.status).toBe(200);
    expect(res.body.config).toMatchObject({
      spreadsheetId: "created-id",
      hiddenColumns: [],
      isGuest: false,
      accessLevel: "edit",
      ownerEmail: null,
    });
  });
});

describe("GET /api/sharing", () => {
  it("should list the owner's shares", async () => {
    signInAs(OWNER);
    mocks.sharing.listSharesForOwner.mockResolvedValue([{ guestEmail: GUEST.email, accessLevel: "view" }]);

    const res = await request("GET", "/api/sharing");

    expect(res.status).toBe(200);
    expect(res.body.shares).toHaveLength(1);
    expect(mocks.sharing.listSharesForOwner).toHaveBeenCalledWith(OWNER.id);
  });

  it("should return 500 when listing fails", async () => {
    signInAs(OWNER);
    mocks.sharing.listSharesForOwner.mockRejectedValue(new Error("db down"));

    const res = await request("GET", "/api/sharing");

    expect(res.status).toBe(500);
  });

  it("should return 403 for a guest", async () => {
    signInAsGuest();

    const res = await request("GET", "/api/sharing");

    expect(res.status).toBe(403);
  });
});

describe("POST /api/sharing", () => {
  it.each([
    ["a missing email", { accessLevel: "view" }],
    ["a malformed email", { guestEmail: "not-an-email", accessLevel: "view" }],
    ["an invalid access level", { guestEmail: "new@test.com", accessLevel: "admin" }],
    ["the owner's own email", { guestEmail: OWNER.email.toUpperCase(), accessLevel: "view" }],
  ])("should return 400 for %s", async (_label, body) => {
    signInAs(OWNER);

    const res = await request("POST", "/api/sharing", { body });

    expect(res.status).toBe(400);
    expect(mocks.sharing.addShare).not.toHaveBeenCalled();
  });

  it("should return 409 GUEST_HAS_OWN_SETUP when the guest already has a setup", async () => {
    signInAs(OWNER);
    mocks.store.hasOwnIndependentSetup.mockResolvedValue(true);

    const res = await request("POST", "/api/sharing", { body: { guestEmail: "new@test.com", accessLevel: "view" } });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("GUEST_HAS_OWN_SETUP");
  });

  it("should create the share, notify the guest, and return 201", async () => {
    signInAs(OWNER);
    mocks.store.hasOwnIndependentSetup.mockResolvedValue(false);

    const res = await request("POST", "/api/sharing", { body: { guestEmail: " New@Test.com ", accessLevel: "edit" } });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ guestEmail: "new@test.com", accessLevel: "edit" });
    expect(mocks.sharing.addShare).toHaveBeenCalledWith(OWNER.id, "new@test.com", "edit");
    expect(mocks.email.sendShareGrantedEmail).toHaveBeenCalledWith({
      ownerEmail: OWNER.email,
      ownerName: "Test",
      guestEmail: "new@test.com",
    });
  });

  it("should return 409 when the guest is already shared with", async () => {
    signInAs(OWNER);
    mocks.store.hasOwnIndependentSetup.mockResolvedValue(false);
    mocks.sharing.addShare.mockRejectedValue(Object.assign(new Error("duplicate"), { code: "23505" }));

    const res = await request("POST", "/api/sharing", { body: { guestEmail: "new@test.com", accessLevel: "view" } });

    expect(res.status).toBe(409);
    expect(mocks.email.sendShareGrantedEmail).not.toHaveBeenCalled();
  });

  it("should return 500 on an unexpected failure", async () => {
    signInAs(OWNER);
    mocks.store.hasOwnIndependentSetup.mockRejectedValue(new Error("db down"));

    const res = await request("POST", "/api/sharing", { body: { guestEmail: "new@test.com", accessLevel: "view" } });

    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/sharing/:guestEmail", () => {
  it("should return 400 for an invalid access level", async () => {
    signInAs(OWNER);

    const res = await request("PATCH", "/api/sharing/guest%40test.com", { body: { accessLevel: "owner" } });

    expect(res.status).toBe(400);
  });

  it("should return 404 when the share does not exist", async () => {
    signInAs(OWNER);
    mocks.sharing.updateShareAccessLevel.mockResolvedValue(false);

    const res = await request("PATCH", "/api/sharing/guest%40test.com", { body: { accessLevel: "view" } });

    expect(res.status).toBe(404);
  });

  it("should update the access level", async () => {
    signInAs(OWNER);
    mocks.sharing.updateShareAccessLevel.mockResolvedValue(true);

    const res = await request("PATCH", "/api/sharing/Guest%40Test.com", { body: { accessLevel: "view" } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ guestEmail: GUEST.email, accessLevel: "view" });
    expect(mocks.sharing.updateShareAccessLevel).toHaveBeenCalledWith(OWNER.id, GUEST.email, "view");
  });

  it("should return 500 when the update fails", async () => {
    signInAs(OWNER);
    mocks.sharing.updateShareAccessLevel.mockRejectedValue(new Error("db down"));

    const res = await request("PATCH", "/api/sharing/guest%40test.com", { body: { accessLevel: "view" } });

    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/sharing/:guestEmail", () => {
  it("should revoke the share, notify the guest, and return 204", async () => {
    signInAs(OWNER);

    const res = await request("DELETE", "/api/sharing/guest%40test.com");

    expect(res.status).toBe(204);
    expect(mocks.sharing.removeShare).toHaveBeenCalledWith(OWNER.id, GUEST.email);
    expect(mocks.email.sendShareRevokedEmail).toHaveBeenCalledWith({ ownerEmail: OWNER.email, guestEmail: GUEST.email });
  });

  it("should return 500 when revoking fails", async () => {
    signInAs(OWNER);
    mocks.sharing.removeShare.mockRejectedValue(new Error("db down"));

    const res = await request("DELETE", "/api/sharing/guest%40test.com");

    expect(res.status).toBe(500);
    expect(mocks.email.sendShareRevokedEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/sharing/guest/reset", () => {
  it("should unlink the guest and return 204", async () => {
    signInAsGuest();

    const res = await request("POST", "/api/sharing/guest/reset");

    expect(res.status).toBe(204);
    expect(mocks.sharing.removeShareAsGuest).toHaveBeenCalledWith(GUEST.email);
  });

  it("should return 403 for an owner", async () => {
    signInAs(OWNER);

    const res = await request("POST", "/api/sharing/guest/reset");

    expect(res.status).toBe(403);
  });

  it("should return 500 when unlinking fails", async () => {
    signInAsGuest();
    mocks.sharing.removeShareAsGuest.mockRejectedValue(new Error("db down"));

    const res = await request("POST", "/api/sharing/guest/reset");

    expect(res.status).toBe(500);
  });
});

describe("admin logs", () => {
  it("should return 403 for a non-admin user", async () => {
    signInAs(OWNER);

    const res = await request("GET", "/api/admin/logs/files");

    expect(res.status).toBe(403);
  });

  it("should list log files for an admin", async () => {
    signInAs(ADMIN);
    mocks.logs.listLogFiles.mockReturnValue(["app-2026-09-29.log"]);

    const res = await request("GET", "/api/admin/logs/files");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: ["app-2026-09-29.log"] });
  });

  it("should return 400 for an unknown log file", async () => {
    signInAs(ADMIN);
    mocks.logs.readLogEntries.mockReturnValue(null);

    const res = await request("GET", "/api/admin/logs/tail?file=nope.log");

    expect(res.status).toBe(400);
  });

  it.each([
    ["", 200],
    ["&lines=0", 200],
    ["&lines=-5", 1],
    ["&lines=5000", 1000],
    ["&lines=50", 50],
  ])("should clamp lines for query '%s' to %i", async (suffix, expected) => {
    signInAs(ADMIN);
    mocks.logs.readLogEntries.mockReturnValue([]);

    const res = await request("GET", `/api/admin/logs/tail?file=app.log&level=error&q=boom${suffix}`);

    expect(res.status).toBe(200);
    expect(mocks.logs.readLogEntries).toHaveBeenCalledWith({ file: "app.log", level: "error", q: "boom", lines: expected });
  });
});
