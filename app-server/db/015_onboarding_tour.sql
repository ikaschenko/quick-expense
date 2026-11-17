BEGIN;

-- Set once when an owner finishes or skips the auto-started Setup tour.
-- No backfill: existing owners are never auto-toured (the client only auto-starts
-- right after a sheet is created/connected) and can replay the tour manually.
ALTER TABLE users ADD COLUMN onboarding_tour_seen_at TIMESTAMPTZ NULL;

COMMIT;
