-- Quick Expense: initial database schema
-- Run against Supabase (or any PostgreSQL 14+) to set up all tables.

CREATE TABLE IF NOT EXISTS users (
  email                    TEXT        PRIMARY KEY,
  access_token             TEXT        NOT NULL,
  access_token_expires_at  BIGINT      NOT NULL,
  refresh_token            TEXT,
  spreadsheet_url          TEXT,
  spreadsheet_id           TEXT,
  last_authenticated_at    BIGINT      NOT NULL,
  last_activity_at         BIGINT      NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fx_rate_backups (
  id              SERIAL       PRIMARY KEY,
  user_email      TEXT         NOT NULL REFERENCES users(email),
  spreadsheet_id  TEXT,
  expense_date    DATE         NOT NULL,
  currency_code   VARCHAR(3)   NOT NULL CHECK (char_length(currency_code) = 3),
  fx_rate         NUMERIC(12,6) NOT NULL,
  submitted_at    TIMESTAMPTZ  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fx_rate_backups_lookup
  ON fx_rate_backups (user_email, spreadsheet_id, submitted_at DESC);

-- Session table for connect-pg-simple.
-- Schema follows https://github.com/voxpelli/connect-pg-simple#table-specification
CREATE TABLE IF NOT EXISTS sessions (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON    NOT NULL,
  expire TIMESTAMPTZ(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions (expire);
