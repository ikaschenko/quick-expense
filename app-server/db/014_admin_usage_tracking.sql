BEGIN;

ALTER TABLE users
  ADD COLUMN first_signed_in_at TIMESTAMPTZ,
  ADD COLUMN connection_validated_at TIMESTAMPTZ,
  ADD COLUMN connection_origin TEXT CHECK (connection_origin IN ('created', 'existing', 'unknown')),
  ADD COLUMN connection_revision BIGINT NOT NULL DEFAULT 0 CHECK (connection_revision >= 0);

-- Existing account rows are inserted during the first successful OAuth callback;
-- created_at is the only reliable historical first-sign-in evidence available.
UPDATE users SET first_signed_in_at = created_at WHERE first_signed_in_at IS NULL;
ALTER TABLE users ALTER COLUMN first_signed_in_at SET NOT NULL;

-- Do not promote historical spreadsheet IDs: older setup flows persisted candidates
-- before Google validation completed, and the database contains no validation proof.
CREATE TABLE setup_connection_provenance (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spreadsheet_id TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('created', 'existing', 'unknown')),
  first_validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, spreadsheet_id)
);

CREATE TABLE user_activity_days (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  PRIMARY KEY (user_id, activity_date)
);
CREATE INDEX user_activity_days_date_idx ON user_activity_days (activity_date);

CREATE TABLE usage_session_days (
  session_date DATE PRIMARY KEY,
  session_count BIGINT NOT NULL DEFAULT 0 CHECK (session_count >= 0)
);

CREATE TABLE browser_usage_sessions (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  browser_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  auth_session_hash TEXT NOT NULL,
  PRIMARY KEY (user_id, browser_id)
);
CREATE INDEX browser_usage_sessions_activity_idx ON browser_usage_sessions (last_activity_at);

CREATE TABLE usage_event_receipts (
  event_id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  browser_id UUID NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX usage_event_receipts_received_idx ON usage_event_receipts (received_at);

CREATE TABLE usage_tracking_coverage (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  tracking_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO usage_tracking_coverage (singleton) VALUES (TRUE);

CREATE TABLE usage_tracking_gaps (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  CHECK (ended_at >= started_at)
);

ALTER TABLE setup_connection_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_session_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_usage_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking_gaps ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON setup_connection_provenance, user_activity_days, usage_session_days,
  browser_usage_sessions, usage_event_receipts, usage_tracking_coverage, usage_tracking_gaps FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON setup_connection_provenance, user_activity_days, usage_session_days,
      browser_usage_sessions, usage_event_receipts, usage_tracking_coverage, usage_tracking_gaps FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON setup_connection_provenance, user_activity_days, usage_session_days,
      browser_usage_sessions, usage_event_receipts, usage_tracking_coverage, usage_tracking_gaps FROM authenticated;
  END IF;
END;
$$;

COMMIT;
