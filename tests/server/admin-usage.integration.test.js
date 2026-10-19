// Resource: disposable qe_admin_usage_* PostgreSQL schema; requires DATABASE_URL.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

const database = vi.hoisted(() => ({ pool: null }));
vi.mock("../../app-server/db.js", () => ({ default: database.pool }));

const schema = `qe_admin_usage_${randomUUID().replaceAll("-", "")}`;
let ownerId;
let usage;
let legacyBackfill;
let migrationTrackingStart;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("Admin usage integration tests require DATABASE_URL in .env.");
  database.pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
  await database.pool.query(`CREATE SCHEMA ${schema}`);
  await database.pool.query(`CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    spreadsheet_id TEXT,
    spreadsheet_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await database.pool.query(`CREATE TABLE setup_shares (
    owner_user_id BIGINT NOT NULL REFERENCES users(id),
    guest_email TEXT NOT NULL,
    access_level TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await database.pool.query("INSERT INTO users (email, spreadsheet_id, created_at) VALUES ('migration-legacy@example.invalid', 'old-sheet', '2020-01-02T03:04:05Z')");
  const migration = await readFile(new URL("../../app-server/db/014_admin_usage_tracking.sql", import.meta.url), "utf8");
  await database.pool.query(migration);
  const { rows: [baseline] } = await database.pool.query("SELECT first_signed_in_at, connection_validated_at, connection_origin FROM users WHERE email = 'migration-legacy@example.invalid'");
  legacyBackfill = baseline;
  const { rows: [coverage] } = await database.pool.query("SELECT tracking_started_at FROM usage_tracking_coverage");
  migrationTrackingStart = coverage.tracking_started_at;
  usage = await import("../../app-server/usage.js");
}, 30_000);

afterAll(async () => {
  if (database.pool) {
    try { await database.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await database.pool.end(); }
  }
});

beforeEach(async () => {
  await database.pool.query("TRUNCATE users, usage_session_days, usage_tracking_gaps RESTART IDENTITY CASCADE");
  const { rows } = await database.pool.query(
    `INSERT INTO users (email, spreadsheet_id, created_at, first_signed_in_at) VALUES
      ('owner@example.invalid', 'saved-sheet', '2024-01-02T03:04:05Z', '2024-01-02T03:04:05Z'),
      ('guest@example.invalid', NULL, '2025-02-03T04:05:06Z', '2025-02-03T04:05:06Z'),
      ('legacy@example.invalid', 'unverified-candidate', '2025-03-04T05:06:07Z', '2025-03-04T05:06:07Z')
     RETURNING id, email`,
  );
  ownerId = Number(rows.find((row) => row.email === "owner@example.invalid").id);
  await database.pool.query("UPDATE users SET connection_validated_at = now(), connection_origin = 'created' WHERE id = $1", [ownerId]);
  await database.pool.query("INSERT INTO setup_shares (owner_user_id, guest_email, access_level) VALUES ($1, 'guest@example.invalid', 'view')", [ownerId]);
});

describe("admin usage PostgreSQL migration and tracking", () => {
  it("defers the tracking baseline until instrumentation is enabled", async () => {
    expect(migrationTrackingStart).toBeNull();
    await usage.initializeUsageTracking();
    const { rows: [enabled] } = await database.pool.query("SELECT tracking_started_at FROM usage_tracking_coverage");
    expect(enabled.tracking_started_at).toBeInstanceOf(Date);
    await usage.initializeUsageTracking();
    const { rows: [again] } = await database.pool.query("SELECT tracking_started_at FROM usage_tracking_coverage");
    expect(again.tracking_started_at).toEqual(enabled.tracking_started_at);
  });

  it("keeps logout termination without prior activity, including across another sign-in", async () => {
    const browserId = randomUUID();
    await usage.endUsageSession(ownerId, browserId, "ended-auth");
    const endedEvent = { userId: ownerId, browserId, authSessionId: "ended-auth", eventId: randomUUID() };
    expect(await usage.recordUsageActivity(endedEvent)).toMatchObject({ rejected: true });
    const { rows: [daily] } = await database.pool.query("SELECT count(*)::int AS count FROM user_activity_days");
    const { rows: [receipts] } = await database.pool.query("SELECT count(*)::int AS count FROM usage_event_receipts");
    expect(daily.count).toBe(0);
    expect(receipts.count).toBe(0);
    expect(await usage.recordUsageActivity({ ...endedEvent, authSessionId: "new-auth", eventId: randomUUID() })).toMatchObject({ sessionStarted: true });
    expect(await usage.recordUsageActivity(endedEvent)).toMatchObject({ rejected: true });
  });

  it("rejects a first arrival already waiting on the logout lock", async () => {
    const browserId = randomUUID();
    const blocker = await database.pool.connect();
    let logout;
    let activity;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${ownerId}:${browserId}`]);
      logout = usage.endUsageSession(ownerId, browserId, "ended-auth");
      // PostgreSQL startup/contention can delay lock visibility; do not strand
      // the queued logout transaction if the probe itself times out.
      await vi.waitFor(async () => {
        const { rows: [waiting] } = await database.pool.query(
          `SELECT count(*)::int AS count FROM pg_locks
           WHERE locktype = 'advisory' AND NOT granted
             AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
             AND classid::bigint = ((hashtextextended($1, 0) >> 32) & 4294967295)
             AND objid::bigint = (hashtextextended($1, 0) & 4294967295)
             AND objsubid = 1`,
          [`${ownerId}:${browserId}`],
        );
        expect(waiting.count).toBeGreaterThan(0);
      }, { timeout: 10_000, interval: 50 });
      activity = usage.recordUsageActivity({ userId: ownerId, browserId, authSessionId: "ended-auth", eventId: randomUUID() });
      await blocker.query("COMMIT");
      await logout;
      expect(await activity).toMatchObject({ rejected: true });
    } finally {
      // Always release the held advisory lock, then drain both queued operations
      // before the next test truncates shared tables in this disposable schema.
      let rollbackError;
      try {
        await blocker.query("ROLLBACK");
      } catch (error) {
        rollbackError = error;
      }
      blocker.release(rollbackError);
      await Promise.allSettled([logout, activity].filter((operation) => operation !== undefined));
      if (rollbackError) throw rollbackError;
    }
  }, 15_000);

  it("does not count a shared guest as connected when the owner's saved sheet is unvalidated", async () => {
    await database.pool.query("UPDATE users SET connection_validated_at = NULL, connection_origin = NULL WHERE id = $1", [ownerId]);
    await database.pool.query("UPDATE usage_tracking_coverage SET tracking_started_at = now() - interval '90 days'");

    const metrics = await usage.getAdminUsageMetrics();

    expect(metrics.users.total).toBe(3);
    expect(metrics.users.connected.count).toBe(0);
    expect(metrics.users.setup.shared.count).toBe(0);
    expect(metrics.users.setup.none.count).toBe(3);
  });

  it("backfills only first sign-in evidence and leaves existing sheet candidates unvalidated", async () => {
    expect(new Date(legacyBackfill.first_signed_in_at).toISOString()).toBe("2020-01-02T03:04:05.000Z");
    expect(legacyBackfill.connection_validated_at).toBeNull();
    expect(legacyBackfill.connection_origin).toBeNull();
    const { rows: [legacy] } = await database.pool.query("SELECT connection_validated_at, connection_origin FROM users WHERE email = 'legacy@example.invalid'");
    expect(legacy.connection_validated_at).toBeNull();
    expect(legacy.connection_origin).toBeNull();
    const { rows: rls } = await database.pool.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'user_activity_days'::regclass");
    expect(rls[0].relrowsecurity).toBe(true);
  });

  it("serializes concurrent tabs, deduplicates delivery, enforces sign-out, and reports mutually exclusive setup categories", async () => {
    const browserId = randomUUID();
    const authSessionId = "auth-session-one";
    const event = (id) => ({ userId: ownerId, browserId, authSessionId, eventId: randomUUID() });
    const parallel = await Promise.all([usage.recordUsageActivity(event()), usage.recordUsageActivity(event())]);
    expect(parallel.filter((value) => value.sessionStarted)).toHaveLength(1);
    const duplicatedEvent = event();
    await usage.recordUsageActivity(duplicatedEvent);
    await expect(usage.recordUsageActivity(duplicatedEvent)).resolves.toMatchObject({ duplicate: true });

    await database.pool.query(
      "UPDATE browser_usage_sessions SET last_activity_at = now() - interval '30 minutes' WHERE user_id = $1 AND browser_id = $2",
      [ownerId, browserId],
    );
    const boundary = await usage.recordUsageActivity(event());
    expect(boundary.sessionStarted).toBe(true);
    await usage.endUsageSession(ownerId, browserId, authSessionId);
    expect(await usage.recordUsageActivity(event())).toMatchObject({ rejected: true });
    expect(await usage.recordUsageActivity({ ...event(), authSessionId: "auth-session-two" })).toMatchObject({ sessionStarted: true });
    const secondBrowser = randomUUID();
    expect(await usage.recordUsageActivity({ userId: ownerId, browserId: secondBrowser, authSessionId: "auth-session-two", eventId: randomUUID() })).toMatchObject({ sessionStarted: true });
    const { rows: [guest] } = await database.pool.query("SELECT id FROM users WHERE email = 'guest@example.invalid'");
    expect(await usage.recordUsageActivity({ userId: Number(guest.id), browserId: secondBrowser, authSessionId: "guest-auth-session", eventId: randomUUID() })).toMatchObject({ sessionStarted: true });

    const { rows: totals } = await database.pool.query("SELECT sum(session_count)::int AS count FROM usage_session_days");
    expect(totals[0].count).toBe(5);
    await database.pool.query("UPDATE user_activity_days SET activity_date = (now() AT TIME ZONE 'UTC')::date - 1");
    await database.pool.query("UPDATE usage_session_days SET session_date = (now() AT TIME ZONE 'UTC')::date - 1");
    await database.pool.query("UPDATE usage_tracking_coverage SET tracking_started_at = now() - interval '2 days'");
    const metrics = await usage.getAdminUsageMetrics();
    expect(metrics.users.total).toBe(3);
    expect(metrics.users.connected.count).toBe(2);
    expect(metrics.users.setup.created.count).toBe(1);
    expect(metrics.users.setup.shared.count).toBe(1);
    expect(metrics.users.setup.none.count).toBe(1);
    expect(Object.values(metrics.users.setup).reduce((sum, category) => sum + category.count, 0)).toBe(3);
    expect(metrics.users.active.current).toBe(2);
    expect(metrics.sessions.lifetime).toBe(5);
    expect(metrics.sessions.current).toBe(5);
    expect(metrics.coverage.current).toBe("insufficient");
  });
});
