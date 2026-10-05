BEGIN;

CREATE TABLE setup_field_defaults (
  owner_user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  spreadsheet_id TEXT,
  values JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(values) = 'object'),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);

INSERT INTO setup_field_defaults (owner_user_id, spreadsheet_id)
SELECT id, spreadsheet_id FROM users;

CREATE FUNCTION sync_setup_field_defaults() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.spreadsheet_id IS NOT DISTINCT FROM NEW.spreadsheet_id THEN
    RETURN NEW;
  END IF;
  INSERT INTO setup_field_defaults (owner_user_id, spreadsheet_id)
  VALUES (NEW.id, NEW.spreadsheet_id)
  ON CONFLICT (owner_user_id) DO UPDATE
    SET spreadsheet_id = EXCLUDED.spreadsheet_id,
        values = '{}'::jsonb,
        version = setup_field_defaults.version + 1
    WHERE setup_field_defaults.spreadsheet_id IS DISTINCT FROM EXCLUDED.spreadsheet_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_setup_field_defaults
AFTER INSERT OR UPDATE OF spreadsheet_id ON users
FOR EACH ROW EXECUTE FUNCTION sync_setup_field_defaults();

ALTER TABLE setup_field_defaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON setup_field_defaults FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON setup_field_defaults FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON setup_field_defaults FROM authenticated;
  END IF;
END;
$$;

COMMIT;