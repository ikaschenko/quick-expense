-- Replace email-based ownership keys with numeric user IDs.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE users ADD CONSTRAINT uq_users_id UNIQUE (id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id IS NULL) THEN
    RAISE EXCEPTION 'users.id backfill failed';
  END IF;
END
$$;

ALTER TABLE fx_rate_backups ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE IF EXISTS user_currencies ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE IF EXISTS user_custom_columns ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE user_column_visibility ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE setup_shares ADD COLUMN IF NOT EXISTS owner_user_id BIGINT;

UPDATE fx_rate_backups t SET user_id = u.id FROM users u WHERE u.email = t.user_email;
/*DO $$
BEGIN
  IF to_regclass('public.user_currencies') IS NOT NULL THEN
    UPDATE user_currencies t SET user_id = u.id FROM users u WHERE u.email = t.user_email;
  END IF;
  IF to_regclass('public.user_custom_columns') IS NOT NULL THEN
    UPDATE user_custom_columns t SET user_id = u.id FROM users u WHERE u.email = t.user_email;
  END IF;
END
$$;*/
UPDATE user_column_visibility t SET user_id = u.id FROM users u WHERE u.email = t.user_email;
UPDATE setup_shares t SET owner_user_id = u.id FROM users u WHERE u.email = t.owner_email;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM fx_rate_backups WHERE user_id IS NULL)
     OR EXISTS (SELECT 1 FROM user_column_visibility WHERE user_id IS NULL)
     OR EXISTS (SELECT 1 FROM setup_shares WHERE owner_user_id IS NULL) THEN
    RAISE EXCEPTION 'Child user ID backfill failed';
  END IF;
  /*IF to_regclass('public.user_currencies') IS NOT NULL
     AND EXISTS (SELECT 1 FROM user_currencies WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'user_currencies user ID backfill failed';
  END IF;
  IF to_regclass('public.user_custom_columns') IS NOT NULL
     AND EXISTS (SELECT 1 FROM user_custom_columns WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'user_custom_columns user ID backfill failed';
  END IF;*/
END
$$;

ALTER TABLE fx_rate_backups DROP CONSTRAINT IF EXISTS fx_rate_backups_user_email_fkey;
ALTER TABLE IF EXISTS user_currencies DROP CONSTRAINT IF EXISTS user_currencies_user_email_fkey;
ALTER TABLE IF EXISTS user_custom_columns DROP CONSTRAINT IF EXISTS user_custom_columns_user_email_fkey;
ALTER TABLE user_column_visibility DROP CONSTRAINT IF EXISTS user_column_visibility_user_email_fkey;
ALTER TABLE setup_shares DROP CONSTRAINT IF EXISTS setup_shares_owner_email_fkey;

ALTER TABLE fx_rate_backups ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE IF EXISTS user_currencies ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE IF EXISTS user_custom_columns ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE user_column_visibility ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE setup_shares ALTER COLUMN owner_user_id SET NOT NULL;

ALTER TABLE fx_rate_backups ADD CONSTRAINT fx_rate_backups_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
/*DO $$
BEGIN
  IF to_regclass('public.user_currencies') IS NOT NULL THEN
    ALTER TABLE user_currencies ADD CONSTRAINT user_currencies_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
  IF to_regclass('public.user_custom_columns') IS NOT NULL THEN
    ALTER TABLE user_custom_columns ADD CONSTRAINT user_custom_columns_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END
$$;*/
ALTER TABLE user_column_visibility ADD CONSTRAINT user_column_visibility_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE setup_shares ADD CONSTRAINT setup_shares_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE users DROP CONSTRAINT users_pkey;
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);

DROP INDEX IF EXISTS idx_fx_rate_backups_lookup;
--DROP INDEX IF EXISTS idx_user_currencies_active;
--DROP INDEX IF EXISTS idx_user_currencies_lookup;
DROP INDEX IF EXISTS uq_user_custom_columns_active;
DROP INDEX IF EXISTS uq_user_column_visibility;
ALTER TABLE setup_shares DROP CONSTRAINT IF EXISTS uq_setup_shares_pair;
DROP INDEX IF EXISTS uq_setup_shares_pair;

CREATE INDEX idx_fx_rate_backups_lookup ON fx_rate_backups (user_id, spreadsheet_id, submitted_at DESC);
/*DO $$
BEGIN
  IF to_regclass('public.user_currencies') IS NOT NULL THEN
    CREATE UNIQUE INDEX idx_user_currencies_active ON user_currencies (user_id, currency_code) WHERE removed_at IS NULL;
    CREATE INDEX idx_user_currencies_lookup ON user_currencies (user_id, removed_at);
  END IF;
  IF to_regclass('public.user_custom_columns') IS NOT NULL THEN
    CREATE UNIQUE INDEX uq_user_custom_columns_active ON user_custom_columns (user_id, lower(column_name)) WHERE removed_at IS NULL;
  END IF;
END
$$;*/
CREATE UNIQUE INDEX uq_user_column_visibility ON user_column_visibility (user_id, spreadsheet_id, canonical_field_name);
ALTER TABLE setup_shares ADD CONSTRAINT uq_setup_shares_pair UNIQUE (owner_user_id, guest_email);

ALTER TABLE fx_rate_backups DROP COLUMN user_email;
ALTER TABLE IF EXISTS user_currencies DROP COLUMN user_email;
ALTER TABLE IF EXISTS user_custom_columns DROP COLUMN user_email;
ALTER TABLE user_column_visibility DROP COLUMN user_email;
ALTER TABLE setup_shares DROP COLUMN owner_email;

COMMIT;