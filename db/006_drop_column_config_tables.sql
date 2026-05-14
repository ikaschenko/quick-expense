-- Migration: Drop column configuration tables.
-- Sheet headers are now the single source of truth for currencies and custom columns.
-- fx_rate_backups is preserved but its currency_code column is widened to support
-- arbitrary currency codes (not restricted to 3-char ISO codes).

-- Widen fx_rate_backups.currency_code to VARCHAR(10) and remove the length check.
ALTER TABLE fx_rate_backups DROP CONSTRAINT IF EXISTS fx_rate_backups_currency_code_check;
ALTER TABLE fx_rate_backups ALTER COLUMN currency_code TYPE VARCHAR(10);

-- Drop column configuration tables (no longer needed).
DROP TABLE IF EXISTS user_custom_columns;
DROP TABLE IF EXISTS user_currencies;
