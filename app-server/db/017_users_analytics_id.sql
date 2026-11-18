BEGIN;

-- PostHog distinct ID for the account: hex SHA-256 of the trimmed, lowercased email.
-- Must stay identical to hashAnalyticsIdentity() in app-server/utils.js and hashEmail() in app-web/services/analytics.ts.
-- New rows get it from updateUserRecord(); existing rows are backfilled here.
ALTER TABLE users ADD COLUMN analytics_id TEXT NULL;

UPDATE users SET analytics_id = encode(sha256(convert_to(lower(btrim(email)), 'UTF8')), 'hex');

ALTER TABLE users ALTER COLUMN analytics_id SET NOT NULL;
CREATE UNIQUE INDEX users_analytics_id_idx ON users (analytics_id);

COMMIT;
