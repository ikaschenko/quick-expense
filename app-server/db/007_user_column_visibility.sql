CREATE TABLE user_column_visibility (
  id                   SERIAL PRIMARY KEY,
  user_email           TEXT NOT NULL REFERENCES users(email),
  spreadsheet_id       TEXT NOT NULL,
  canonical_field_name VARCHAR(30) NOT NULL,
  hidden_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A row present = column is hidden. Absent = visible.
CREATE UNIQUE INDEX uq_user_column_visibility
  ON user_column_visibility (user_email, spreadsheet_id, canonical_field_name);
