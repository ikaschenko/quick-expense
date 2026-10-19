import crypto from "node:crypto";
import pool from "./db.js";

const BROWSER_COOKIE = "qe_usage_browser";
const TRACKING_INTERVAL_MS = 60_000;
const ALLOWED_SCREENS = new Set(["home", "setup", "add", "edit", "history", "admin", "logs"]);

function parseCookie(header, name) {
  for (const item of String(header ?? "").split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export function getOrCreateBrowserId(req, res) {
  const existing = parseCookie(req.headers.cookie, BROWSER_COOKIE);
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing;

  const browserId = crypto.randomUUID();
  const secure = process.env.FRONTEND_BASE_URL?.startsWith("https") ? "; Secure" : "";
  res.append("Set-Cookie", `${BROWSER_COOKIE}=${browserId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  return browserId;
}

export function isUsageScreen(screen) {
  return typeof screen === "string" && ALLOWED_SCREENS.has(screen);
}

function authSessionHash(sessionId) {
  return crypto.createHash("sha256").update(String(sessionId)).digest("hex");
}


export function createUsageEnvelope({ userId, browserId, authSessionId, eventId, screen, now = Date.now() }) {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    userId: Number(userId),
    browserId,
    sessionHash: authSessionHash(authSessionId),
    eventId,
    screen,
    issuedAt: now,
    expiresAt: now + 120_000,
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyUsageEnvelope(token, { userId, browserId, authSessionId, eventId, screen, now = Date.now() }) {
  if (typeof token !== "string" || token.length > 1024) return false;
  const [payload, suppliedSignature, ...extra] = token.split(".");
  if (!payload || !suppliedSignature || extra.length) return false;
  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest();
  let actual;
  try { actual = Buffer.from(suppliedSignature, "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return value.version === 1 && value.userId === Number(userId) && value.browserId === browserId &&
      value.sessionHash === authSessionHash(authSessionId) && value.eventId === eventId && value.screen === screen && Number.isFinite(value.issuedAt) &&
      Number.isFinite(value.expiresAt) && value.expiresAt - value.issuedAt === 120_000 &&
      value.issuedAt <= now + 30_000 && value.expiresAt >= now;
  } catch {
    return false;
  }
}

export async function hasUsageEventReceipt({ userId, browserId, eventId }) {
  const { rows } = await pool.query(
    "SELECT user_id, browser_id FROM usage_event_receipts WHERE event_id = $1",
    [eventId],
  );
  return rows.length > 0 && Number(rows[0].user_id) === Number(userId) && rows[0].browser_id === browserId;
}

export async function recordUsageActivity({ userId, browserId, eventId, authSessionId }) {
  const sessionHash = authSessionHash(authSessionId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${userId}:${browserId}`]);
    const receipt = await client.query(
      `INSERT INTO usage_event_receipts (event_id, user_id, browser_id)
       VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [eventId, userId, browserId],
    );
    if (receipt.rowCount === 0) {
      const { rows: existing } = await client.query(
        "SELECT user_id, browser_id FROM usage_event_receipts WHERE event_id = $1",
        [eventId],
      );
      const sameEvent = existing[0] && Number(existing[0].user_id) === Number(userId) && existing[0].browser_id === browserId;
      await client.query("COMMIT");
      return sameEvent
        ? { duplicate: true, sessionStarted: false }
        : { duplicate: false, sessionStarted: false, rejected: true };
    }

    const { rows: [clock] } = await client.query(
      `SELECT received_at AS now, to_char((received_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS utc_date
       FROM (SELECT clock_timestamp() AS received_at) receipt`,
    );
    const now = clock.now;
    await client.query(
      `INSERT INTO user_activity_days (user_id, activity_date) VALUES ($1, $2)
       ON CONFLICT (user_id, activity_date) DO NOTHING`,
      [userId, clock.utc_date],
    );

    const { rows: [current] } = await client.query(
      "SELECT last_activity_at, ended_at, auth_session_hash FROM browser_usage_sessions WHERE user_id = $1 AND browser_id = $2 FOR UPDATE",
      [userId, browserId],
    );
    if (current?.ended_at && current.auth_session_hash === sessionHash) {
      await client.query("COMMIT");
      return { duplicate: false, sessionStarted: false, rejected: true };
    }
    const continues = current && !current.ended_at && new Date(current.last_activity_at).getTime() > new Date(now).getTime() - 30 * 60_000;
    if (continues) {
      await client.query(
        `UPDATE browser_usage_sessions SET last_activity_at = $3, auth_session_hash = $4
         WHERE user_id = $1 AND browser_id = $2`,
        [userId, browserId, now, sessionHash],
      );
      await client.query("COMMIT");
      return { duplicate: false, sessionStarted: false };
    }

    await client.query(
      `INSERT INTO browser_usage_sessions (user_id, browser_id, started_at, last_activity_at, ended_at, auth_session_hash)
       VALUES ($1, $2, $3, $3, NULL, $4)
       ON CONFLICT (user_id, browser_id) DO UPDATE SET
         started_at = EXCLUDED.started_at, last_activity_at = EXCLUDED.last_activity_at,
         ended_at = NULL, auth_session_hash = EXCLUDED.auth_session_hash`,
      [userId, browserId, now, sessionHash],
    );
    await client.query(
      `INSERT INTO usage_session_days (session_date, session_count) VALUES ($1, 1)
       ON CONFLICT (session_date) DO UPDATE SET session_count = usage_session_days.session_count + 1`,
      [clock.utc_date],
    );
    await client.query("COMMIT");
    return { duplicate: false, sessionStarted: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function endUsageSession(userId, browserId, authSessionId) {
  if (!browserId || !authSessionId) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${userId}:${browserId}`]);
    await client.query(
      `UPDATE browser_usage_sessions SET ended_at = now(), auth_session_hash = $3
       WHERE user_id = $1 AND browser_id = $2 AND ended_at IS NULL`,
      [userId, browserId, authSessionHash(authSessionId)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupUsageTracking() {
  await pool.query("DELETE FROM user_activity_days WHERE activity_date < (now() AT TIME ZONE 'UTC')::date - 90");
  await pool.query("DELETE FROM usage_event_receipts WHERE received_at < now() - interval '24 hours'");
  await pool.query("DELETE FROM browser_usage_sessions WHERE last_activity_at < now() - interval '31 minutes'");
}

export async function initializeUsageTracking() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [coverage] } = await client.query("SELECT last_heartbeat_at FROM usage_tracking_coverage WHERE singleton = TRUE FOR UPDATE");
    const now = new Date();
    const prior = new Date(coverage.last_heartbeat_at);
    if (now.getTime() - prior.getTime() > TRACKING_INTERVAL_MS + 5_000) {
      await client.query("INSERT INTO usage_tracking_gaps (started_at, ended_at) VALUES ($1, $2)", [prior, now]);
    }
    await client.query("UPDATE usage_tracking_coverage SET last_started_at = $1, last_heartbeat_at = $1 WHERE singleton = TRUE", [now]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function heartbeatUsageTracking() {
  await pool.query("UPDATE usage_tracking_coverage SET last_heartbeat_at = now() WHERE singleton = TRUE");
}

function utcDate(date) {
  return date.toISOString().slice(0, 10);
}

function period(start, end) {
  return { start: utcDate(start), endExclusive: utcDate(end), end: utcDate(new Date(end.getTime() - 86_400_000)) };
}

function change(current, previous) {
  if (previous === null || current === null) return { kind: "unavailable" };
  if (previous === 0 && current === 0) return { kind: "no-change", absolute: 0, percent: 0 };
  if (previous === 0) return { kind: "no-previous-activity", absolute: current, percent: null };
  const value = ((current - previous) / previous) * 100;
  return { kind: value > 0 ? "increase" : value < 0 ? "decrease" : "no-change", absolute: current - previous, percent: Number(value.toFixed(1)) };
}

export async function getAdminUsageMetrics() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: [snapshot] } = await client.query(
      `SELECT transaction_timestamp() AS snapshot_at,
              to_char((transaction_timestamp() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS today_utc,
              tracking_started_at
       FROM usage_tracking_coverage WHERE singleton = TRUE`,
    );
    const todayDate = snapshot.today_utc instanceof Date
      ? utcDate(snapshot.today_utc)
      : String(snapshot.today_utc).slice(0, 10);
    const today = new Date(`${todayDate}T00:00:00.000Z`);
    const currentStart = new Date(today.getTime() - 30 * 86_400_000);
    const previousStart = new Date(today.getTime() - 60 * 86_400_000);
    const trackingStart = new Date(snapshot.tracking_started_at);
    const currentPeriod = period(currentStart, today);
    const previousPeriod = period(previousStart, currentStart);

    const { rows: [users] } = await client.query(
      `WITH classifications AS (
         SELECT u.id,
           CASE
             WHEN u.connection_validated_at IS NOT NULL AND u.spreadsheet_id IS NOT NULL THEN
               CASE WHEN u.connection_origin = 'created' THEN 'created'
                    WHEN u.connection_origin = 'existing' THEN 'existing' ELSE 'unknown' END
             WHEN EXISTS (
               SELECT 1 FROM setup_shares s JOIN users shared_owner ON shared_owner.id = s.owner_user_id
               WHERE s.guest_email = u.email AND shared_owner.connection_validated_at IS NOT NULL
                 AND shared_owner.spreadsheet_id IS NOT NULL
             ) THEN 'shared'
             ELSE 'none'
           END AS category
         FROM users u
       )
       SELECT count(*)::int AS total,
         count(*) FILTER (WHERE category <> 'none')::int AS connected,
         count(*) FILTER (WHERE category = 'created')::int AS created,
         count(*) FILTER (WHERE category = 'existing')::int AS existing,
         count(*) FILTER (WHERE category = 'shared')::int AS shared,
         count(*) FILTER (WHERE category = 'unknown')::int AS unknown,
         count(*) FILTER (WHERE category = 'none')::int AS no_setup
       FROM classifications`,
    );
    const { rows: [signins] } = await client.query(
      `SELECT count(*) FILTER (WHERE first_signed_in_at >= $1 AND first_signed_in_at < $2)::int AS current_new,
              count(*) FILTER (WHERE first_signed_in_at >= $3 AND first_signed_in_at < $1)::int AS previous_new
       FROM users`, [currentStart, today, previousStart],
    );
    const { rows: [activity] } = await client.query(
      `SELECT count(DISTINCT user_id) FILTER (WHERE activity_date >= $1 AND activity_date < $2)::int AS current_active,
              count(DISTINCT user_id) FILTER (WHERE activity_date >= $3 AND activity_date < $1)::int AS previous_active
       FROM user_activity_days`, [currentPeriod.start, currentPeriod.endExclusive, previousPeriod.start],
    );
    const { rows: [sessions] } = await client.query(
      `SELECT coalesce(sum(session_count), 0)::bigint AS lifetime,
              coalesce(sum(session_count) FILTER (WHERE session_date >= $1 AND session_date < $2), 0)::bigint AS current_sessions,
              coalesce(sum(session_count) FILTER (WHERE session_date >= $3 AND session_date < $1), 0)::bigint AS previous_sessions
       FROM usage_session_days`, [currentPeriod.start, currentPeriod.endExclusive, previousPeriod.start],
    );
    const { rows: gaps } = await client.query(
      `SELECT started_at, ended_at FROM usage_tracking_gaps
       WHERE started_at < $1 AND ended_at > $2`, [today, previousStart],
    );
    const currentCovered = trackingStart <= currentStart && !gaps.some((gap) => new Date(gap.started_at) < today && new Date(gap.ended_at) > currentStart);
    const previousCovered = trackingStart <= previousStart && !gaps.some((gap) => new Date(gap.started_at) < currentStart && new Date(gap.ended_at) > previousStart);
    const categories = {
      created: Number(users.created), existing: Number(users.existing), shared: Number(users.shared),
      unknown: Number(users.unknown), none: Number(users.no_setup),
    };
    const total = Number(users.total);
    const pct = (count) => total === 0 ? 0 : Number(((count / total) * 100).toFixed(1));
    const currentSessions = Number(sessions.current_sessions);
    const previousSessions = Number(sessions.previous_sessions);
    const currentActive = Number(activity.current_active);
    const previousActive = Number(activity.previous_active);
    const currentNew = Number(signins.current_new);
    const previousNew = Number(signins.previous_new);
    const currentAverage = currentCovered ? Number((currentSessions / 30).toFixed(1)) : null;
    const previousAverage = previousCovered ? Number((previousSessions / 30).toFixed(1)) : null;
    const activityChange = currentCovered && previousCovered ? change(currentActive, previousActive) : { kind: "unavailable" };
    const sessionChange = currentCovered && previousCovered ? change(currentSessions, previousSessions) : { kind: "unavailable" };
    const averageChange = currentAverage === null || previousAverage === null
      ? { kind: "unavailable" }
      : change(currentSessions / 30, previousSessions / 30);

    await client.query("COMMIT");
    return {
      snapshotAt: new Date(snapshot.snapshot_at).toISOString(),
      timezone: "UTC",
      trackingStartedAt: trackingStart.toISOString(),
      periods: { current: currentPeriod, previous: previousPeriod },
      coverage: { current: currentCovered ? "complete" : "insufficient", previous: previousCovered ? "complete" : "insufficient" },
      users: {
        total,
        connected: { count: Number(users.connected), percent: pct(Number(users.connected)) },
        setup: Object.fromEntries(Object.entries(categories).map(([key, count]) => [key, { count, percent: pct(count) }])),
        active: { current: currentActive, previous: previousActive, change: activityChange },
        new: { current: currentNew, previous: previousNew, change: change(currentNew, previousNew) },
      },
      sessions: {
        lifetime: Number(sessions.lifetime),
        current: currentSessions,
        previous: previousSessions,
        averagePerDay: { current: currentAverage, previous: previousAverage },
        change: sessionChange,
        averageChange,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export const usageTracking = { BROWSER_COOKIE, ALLOWED_SCREENS };
