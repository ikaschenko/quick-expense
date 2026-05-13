CREATE TABLE user_custom_columns (
  id          SERIAL PRIMARY KEY,
  user_email  TEXT NOT NULL REFERENCES users(email),
  column_name VARCHAR(30) NOT NULL,
  position    SMALLINT NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at  TIMESTAMPTZ NULL
);

-- Case-insensitive uniqueness among active columns per user
CREATE UNIQUE INDEX uq_user_custom_columns_active
  ON user_custom_columns (user_email, lower(column_name))
  WHERE removed_at IS NULL;
