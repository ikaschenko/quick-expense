-- User-selected optional currencies (non-USD).
-- Each row represents a currency that a user added to their configuration.
-- When removed, `removed_at` is set instead of deleting the row (for audit trail).

CREATE TABLE IF NOT EXISTS user_currencies (
  id             SERIAL        PRIMARY KEY,
  user_email     TEXT          NOT NULL REFERENCES users(email),
  currency_code  VARCHAR(3)    NOT NULL CHECK (char_length(currency_code) = 3),
  added_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  removed_at     TIMESTAMPTZ
);

-- Only one active row per (user, currency) at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_currencies_active
  ON user_currencies (user_email, currency_code) WHERE removed_at IS NULL;

-- Fast lookup of a user's active currencies.
CREATE INDEX IF NOT EXISTS idx_user_currencies_lookup
  ON user_currencies (user_email, removed_at);
