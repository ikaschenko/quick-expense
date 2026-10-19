const { pool, clientQuery, release } = vi.hoisted(() => ({
  pool: { connect: vi.fn(), query: vi.fn() },
  clientQuery: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../../app-server/db.js", () => ({ default: pool }));

let createUsageEnvelope;
let verifyUsageEnvelope;
let isUsageScreen;
let getOrCreateBrowserId;
let recordUsageActivity;
let endUsageSession;
let cleanupUsageTracking;
let getAdminUsageMetrics;
let hasUsageEventReceipt;
let initializeUsageTracking;
let heartbeatUsageTracking;

beforeAll(async () => {
  ({
    createUsageEnvelope,
    verifyUsageEnvelope,
    isUsageScreen,
    getOrCreateBrowserId,
    recordUsageActivity,
    endUsageSession,
    cleanupUsageTracking,
    getAdminUsageMetrics,
    hasUsageEventReceipt,
    initializeUsageTracking,
    heartbeatUsageTracking,
  } = await import("../../app-server/usage.js"));
});

beforeEach(() => {
  clientQuery.mockReset();
  release.mockReset();
  pool.connect.mockReset().mockResolvedValue({ query: clientQuery, release });
  pool.query.mockReset().mockResolvedValue({ rows: [] });
  process.env.SESSION_SECRET = "usage-test-secret";
});

describe("usage event validation", () => {
  it.each(["home", "setup", "add", "edit", "history", "admin", "logs"])("accepts approved screen %s", (screen) => {
    expect(isUsageScreen(screen)).toBe(true);
  });

  it.each(["/admin", "expenses", "", null, 4])("rejects unsupported screen %s", (screen) => {
    expect(isUsageScreen(screen)).toBe(false);
  });

  it("issues an event-bound two-minute envelope for the same user, browser, and auth session", () => {
    const claims = { userId: 7, browserId: "abc", authSessionId: "session-secret", eventId: "event-1", screen: "home", now: 10_000 };
    const envelope = createUsageEnvelope(claims);
    expect(verifyUsageEnvelope(envelope, { ...claims, now: 130_000 })).toBe(true);
    expect(verifyUsageEnvelope(envelope, { ...claims, now: 130_001 })).toBe(false);
    expect(verifyUsageEnvelope(envelope, { ...claims, screen: "admin", now: 10_000 })).toBe(false);
    expect(verifyUsageEnvelope(`${envelope}tampered`, claims)).toBe(false);
  });

  it("sets a random HttpOnly, same-site browser cookie and reuses a valid one", () => {
    const response = { append: vi.fn() };
    const id = getOrCreateBrowserId({ headers: {} }, response);
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.append).toHaveBeenCalledWith("Set-Cookie", expect.stringContaining("HttpOnly; SameSite=Lax"));
    const reused = getOrCreateBrowserId({ headers: { cookie: `other=x; qe_usage_browser=${id}` } }, response);
    expect(reused).toBe(id);
  });
});

describe("usage lifecycle helpers", () => {
  it("checks receipt ownership and browser scope", async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ user_id: "9", browser_id: "browser-id" }] });
    await expect(hasUsageEventReceipt({ userId: 9, browserId: "browser-id", eventId: "event-id" })).resolves.toBe(true);
    pool.query.mockResolvedValueOnce({ rows: [{ user_id: "10", browser_id: "browser-id" }] });
    await expect(hasUsageEventReceipt({ userId: 9, browserId: "browser-id", eventId: "event-id" })).resolves.toBe(false);
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(hasUsageEventReceipt({ userId: 9, browserId: "other-browser", eventId: "missing" })).resolves.toBe(false);
  });

  it("records a restart gap when the last durable heartbeat is stale", async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.includes("SELECT last_heartbeat_at")) return { rows: [{ last_heartbeat_at: new Date(Date.now() - 120_000) }] };
      return { rows: [] };
    });
    await initializeUsageTracking();
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO usage_tracking_gaps"))).toBe(true);
    expect(clientQuery.mock.calls.at(-2)[0]).toContain("UPDATE usage_tracking_coverage");
    expect(clientQuery.mock.calls.at(-1)[0]).toBe("COMMIT");
  });

  it("does not record a gap for a recent heartbeat and refreshes the durable heartbeat", async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.includes("SELECT last_heartbeat_at")) return { rows: [{ last_heartbeat_at: new Date(Date.now() - 10_000) }] };
      return { rows: [] };
    });
    await initializeUsageTracking();
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO usage_tracking_gaps"))).toBe(false);
    await heartbeatUsageTracking();
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE usage_tracking_coverage SET last_heartbeat_at"));
  });

  it("does not attempt to end an absent browser or authentication session", async () => {
    await endUsageSession(9, null, "session");
    await endUsageSession(9, "browser", null);
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe("recordUsageActivity", () => {
  const event = { userId: 9, browserId: "browser-id", eventId: "event-id", authSessionId: "session-id" };
  const now = new Date("2026-10-19T12:00:00Z");

  function configure({ receiptRowCount = 1, current = null } = {}) {
    clientQuery.mockImplementation(async (sql) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("INSERT INTO usage_event_receipts")) return { rows: [{ event_id: event.eventId }], rowCount: receiptRowCount };
      if (sql.includes("SELECT user_id, browser_id FROM usage_event_receipts")) return { rows: [{ user_id: event.userId, browser_id: event.browserId }] };
      if (sql.includes("FROM (SELECT clock_timestamp")) return { rows: [{ now, utc_date: "2026-10-19" }] };
      if (sql.includes("SELECT last_activity_at")) return { rows: current ? [current] : [] };
      return { rows: [], rowCount: 1 };
    });
  }

  it("starts and increments one durable session on the first authenticated arrival", async () => {
    configure();
    await expect(recordUsageActivity(event)).resolves.toMatchObject({ sessionStarted: true, duplicate: false });
    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO usage_session_days"), ["2026-10-19"]);
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("continues at 29:59 and starts another session at exactly 30 minutes", async () => {
    const recent = { last_activity_at: new Date(now.getTime() - 29 * 60_000 - 59_000), ended_at: null, auth_session_hash: "ignored" };
    configure({ current: recent });
    await expect(recordUsageActivity(event)).resolves.toMatchObject({ sessionStarted: false });
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO usage_session_days"))).toBe(false);

    clientQuery.mockReset();
    configure({ current: { ...recent, last_activity_at: new Date(now.getTime() - 30 * 60_000) } });
    await expect(recordUsageActivity({ ...event, eventId: "event-2" })).resolves.toMatchObject({ sessionStarted: true });
  });

  it("deduplicates repeated delivery without writing a second activity or session", async () => {
    configure({ receiptRowCount: 0 });
    await expect(recordUsageActivity(event)).resolves.toMatchObject({ duplicate: true, sessionStarted: false });
    expect(clientQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO user_activity_days"))).toBe(false);
  });

  it("rolls back failed writes and releases the pooled client", async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO user_activity_days")) throw new Error("database unavailable");
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("INSERT INTO usage_event_receipts")) return { rows: [{ event_id: event.eventId }], rowCount: 1 };
      if (sql.includes("FROM (SELECT clock_timestamp")) return { rows: [{ now, utc_date: "2026-10-19" }] };
      return { rows: [] };
    });
    await expect(recordUsageActivity(event)).rejects.toThrow("database unavailable");
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("ends sessions under the same cross-tab advisory lock and retains only the session hash", async () => {
    clientQuery.mockResolvedValue({ rows: [] });
    await endUsageSession(event.userId, event.browserId, event.authSessionId);
    expect(clientQuery.mock.calls[1][0]).toContain("pg_advisory_xact_lock");
    expect(clientQuery.mock.calls[2][0]).toContain("ended_at = now()");
    expect(clientQuery.mock.calls[2][1][2]).not.toBe(event.authSessionId);
  });

  it("cleans identity-level activity for 90 days and receipts for 24 hours", async () => {
    await cleanupUsageTracking();
    expect(pool.query.mock.calls.map(([sql]) => sql)).toEqual(expect.arrayContaining([
      expect.stringContaining("activity_date <"),
      expect.stringContaining("interval '24 hours'"),
      expect.stringContaining("interval '31 minutes'"),
    ]));
  });
});

describe("getAdminUsageMetrics", () => {
  it("calculates mutually exclusive adoption percentages and complete UTC periods in one snapshot", async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.startsWith("BEGIN")) return { rows: [] };
      if (sql.includes("snapshot_at")) return { rows: [{ snapshot_at: "2026-10-19T12:00:00.000Z", today_utc: "2026-10-19", tracking_started_at: "2026-07-01T00:00:00.000Z" }] };
      if (sql.includes("WITH classifications")) return { rows: [{ total: 10, connected: 6, created: 2, existing: 1, shared: 1, unknown: 2, no_setup: 4 }] };
      if (sql.includes("first_signed_in_at")) return { rows: [{ current_new: 3, previous_new: 2 }] };
      if (sql.includes("user_activity_days")) return { rows: [{ current_active: 5, previous_active: 4 }] };
      if (sql.includes("usage_session_days")) return { rows: [{ lifetime: "25", current_sessions: "6", previous_sessions: "4" }] };
      if (sql.includes("usage_tracking_gaps")) return { rows: [] };
      return { rows: [] };
    });

    const metrics = await getAdminUsageMetrics();
    expect(clientQuery.mock.calls[0][0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(metrics.periods).toEqual({
      current: { start: "2026-09-19", endExclusive: "2026-10-19", end: "2026-10-18" },
      previous: { start: "2026-08-20", endExclusive: "2026-09-19", end: "2026-09-18" },
    });
    expect(metrics.users.setup.created).toEqual({ count: 2, percent: 20 });
    expect(metrics.users.setup.none).toEqual({ count: 4, percent: 40 });
    expect(metrics.users.connected).toEqual({ count: 6, percent: 60 });
    expect(metrics.sessions.averagePerDay).toEqual({ current: 0.2, previous: 0.1 });
    expect(metrics.sessions.change).toEqual({ kind: "increase", absolute: 2, percent: 50 });
    expect(metrics.coverage).toEqual({ current: "complete", previous: "complete" });
  });

  it("reports zero percentages and marks periods insufficient rather than manufacturing comparisons", async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.startsWith("BEGIN")) return { rows: [] };
      if (sql.includes("snapshot_at")) return { rows: [{ snapshot_at: "2026-10-19T12:00:00.000Z", today_utc: "2026-10-19", tracking_started_at: "2026-10-01T00:00:00.000Z" }] };
      if (sql.includes("WITH classifications")) return { rows: [{ total: 0, connected: 0, created: 0, existing: 0, shared: 0, unknown: 0, no_setup: 0 }] };
      if (sql.includes("first_signed_in_at")) return { rows: [{ current_new: 0, previous_new: 0 }] };
      if (sql.includes("user_activity_days")) return { rows: [{ current_active: 0, previous_active: 0 }] };
      if (sql.includes("usage_session_days")) return { rows: [{ lifetime: "0", current_sessions: "0", previous_sessions: "0" }] };
      if (sql.includes("usage_tracking_gaps")) return { rows: [] };
      return { rows: [] };
    });
    const metrics = await getAdminUsageMetrics();
    expect(metrics.users.connected.percent).toBe(0);
    expect(metrics.users.setup.none.percent).toBe(0);
    expect(metrics.coverage).toEqual({ current: "insufficient", previous: "insufficient" });
    expect(metrics.sessions.averagePerDay).toEqual({ current: null, previous: null });
    expect(metrics.sessions.change).toEqual({ kind: "unavailable" });
    expect(metrics.users.active.current).toBe(0);
  });

  it("reports absolute increase when a complete prior period had no activity", async () => {
    clientQuery.mockImplementation(async (sql) => {
      if (sql.startsWith("BEGIN")) return { rows: [] };
      if (sql.includes("snapshot_at")) return { rows: [{ snapshot_at: "2026-10-19T12:00:00.000Z", today_utc: "2026-10-19", tracking_started_at: "2026-07-01T00:00:00.000Z" }] };
      if (sql.includes("WITH classifications")) return { rows: [{ total: 1, connected: 0, created: 0, existing: 0, shared: 0, unknown: 0, no_setup: 1 }] };
      if (sql.includes("first_signed_in_at")) return { rows: [{ current_new: 1, previous_new: 0 }] };
      if (sql.includes("user_activity_days")) return { rows: [{ current_active: 2, previous_active: 0 }] };
      if (sql.includes("usage_session_days")) return { rows: [{ lifetime: "2", current_sessions: "2", previous_sessions: "0" }] };
      if (sql.includes("usage_tracking_gaps")) return { rows: [] };
      return { rows: [] };
    });
    const metrics = await getAdminUsageMetrics();
    expect(metrics.users.active.change).toEqual({ kind: "no-previous-activity", absolute: 2, percent: null });
    expect(metrics.sessions.change).toEqual({ kind: "no-previous-activity", absolute: 2, percent: null });
  });
});
