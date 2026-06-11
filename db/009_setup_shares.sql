-- Setup sharing: allows a setup owner to share their configuration with other users.
-- guest_email has no FK because an invited user may not have authenticated yet.
-- ON DELETE CASCADE on owner_email handles owner account deletion (Story 4).

CREATE TABLE IF NOT EXISTS setup_shares (
  id           SERIAL       PRIMARY KEY,
  owner_email  TEXT         NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  guest_email  TEXT         NOT NULL,
  access_level VARCHAR(4)   NOT NULL CHECK (access_level IN ('view', 'edit')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_setup_shares_pair UNIQUE (owner_email, guest_email)
);

-- Hot path: resolve guest → owner on every authenticated request.
CREATE INDEX IF NOT EXISTS idx_setup_shares_guest ON setup_shares (guest_email);
