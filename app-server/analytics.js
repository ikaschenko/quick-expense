import pool from "./db.js";
import logger from "./logger.js";
import { getAnalyticsKey } from "./utils.js";

const POSTHOG_BATCH_URL = "https://us.i.posthog.com/batch/";
const BATCH_SIZE = 50;
const DELIVERY_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

let delivering = false;

/**
 * Sends due outbox events to PostHog. Rows are leased by pushing next_attempt_at forward, so
 * concurrent machines never send the same batch; the event UUID makes any resend idempotent.
 */
export async function deliverAnalyticsOutbox() {
  const key = getAnalyticsKey();
  if (!key || delivering) return;
  delivering = true;
  try {
    const { rows } = await pool.query(
      `UPDATE analytics_outbox
          SET attempts = attempts + 1, next_attempt_at = now() + interval '5 minutes'
        WHERE event_id IN (
          SELECT event_id FROM analytics_outbox
           WHERE delivered_at IS NULL AND next_attempt_at <= now()
           ORDER BY next_attempt_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED)
      RETURNING event_id, event, distinct_id, properties, occurred_at, attempts`,
      [BATCH_SIZE],
    );
    if (rows.length === 0) return;

    const ids = rows.map((row) => row.event_id);
    try {
      const response = await fetch(POSTHOG_BATCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          batch: rows.map((row) => ({
            uuid: row.event_id,
            event: row.event,
            distinct_id: row.distinct_id,
            properties: { ...row.properties, $lib: "quick-expense-server" },
            timestamp: row.occurred_at.toISOString(),
          })),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`PostHog responded with HTTP ${response.status}`);
    } catch (error) {
      await pool.query(
        `UPDATE analytics_outbox
            SET last_error = $2, next_attempt_at = now() + interval '1 minute' * power(2, LEAST(attempts, 6))
          WHERE event_id = ANY($1::uuid[])`,
        [ids, error.message],
      );
      logger.warn("analytics_delivery_failed", { error: error.message, events: ids.length, attempts: rows[0].attempts });
      return;
    }
    await pool.query(
      "UPDATE analytics_outbox SET delivered_at = now(), last_error = NULL WHERE event_id = ANY($1::uuid[])",
      [ids],
    );
  } finally {
    delivering = false;
  }
}

export function triggerAnalyticsDelivery() {
  void deliverAnalyticsOutbox().catch((error) => logger.warn("analytics_delivery_failed", { error: error.message }));
}

export function startAnalyticsDelivery() {
  triggerAnalyticsDelivery();
  const timer = setInterval(triggerAnalyticsDelivery, DELIVERY_INTERVAL_MS);
  timer.unref?.();
}
