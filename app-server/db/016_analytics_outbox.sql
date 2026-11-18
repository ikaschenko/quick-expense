BEGIN;

-- Durable queue for server-side PostHog events. Rows are inserted in the same statement
-- that creates the account, so a signup can never exist without its pending event.
-- No backfill: existing accounts cannot be attributed to a landing visit retroactively.
CREATE TABLE analytics_outbox (
  event_id UUID PRIMARY KEY,
  event TEXT NOT NULL,
  distinct_id TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX analytics_outbox_pending_idx ON analytics_outbox (next_attempt_at) WHERE delivered_at IS NULL;

ALTER TABLE analytics_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON analytics_outbox FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON analytics_outbox FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON analytics_outbox FROM authenticated;
  END IF;
END;
$$;

COMMIT;
