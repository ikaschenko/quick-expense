# Database Setup

Quick Expense uses PostgreSQL (hosted on Supabase Free tier in production).

## Initial Setup

Run the schema script against your database:

```bash
psql "$DATABASE_URL" -f app-server/db/001_initial_schema.sql
```

## Local Development (Windows 11)

### Option A: Native PostgreSQL Install

1. **Download** PostgreSQL 16+ from https://www.postgresql.org/download/windows/ (use the interactive installer by EDB).

2. **Run the installer.** During the wizard:
   - Choose a password for the `postgres` superuser (remember it — you'll use it for `DATABASE_URL`).
   - Keep the default port **5432**.
   - Leave the locale as default.
   - When prompted to launch Stack Builder at the end, you can skip it.

3. **Add `psql` to your PATH** (if the installer didn't do it). The default location is:
   ```
   C:\Program Files\PostgreSQL\16\bin
   ```
   Add it to your system or user `PATH` environment variable, then restart your terminal.

4. **Create the database.** Open a terminal and run:
   ```powershell
   psql -U postgres -c "CREATE DATABASE quickexpense;"
   ```
   Enter the password you set during installation when prompted.

5. **Run the schema script:**
   ```powershell
   psql -U postgres -d quickexpense -f app-server/db/001_initial_schema.sql
   ```

6. **Set the environment variable** in your `.env` file:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/quickexpense
   ```

### Option B: Docker

If you have Docker Desktop installed:

```bash
docker run --name qe-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=quickexpense -p 5432:5432 -d postgres:16
```

Then run the schema script:

```powershell
psql "postgresql://postgres:postgres@localhost:5432/quickexpense" -f app-server/db/001_initial_schema.sql
```

Set in `.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/quickexpense
```

### Verifying the Setup

Connect to the database and check that the tables were created:

```powershell
psql -U postgres -d quickexpense -c "\dt"
```

You should see the tables created by migrations applied so far, including `users`, `fx_rate_backups`, `sessions`, `user_currencies`, `user_column_visibility`, `setup_shares`, `setup_field_defaults`, and (after migration 014) `setup_connection_provenance`, `user_activity_days`, `usage_session_days`, `browser_usage_sessions`, `usage_event_receipts`, `usage_ended_auth_sessions`, `usage_tracking_coverage`, and `usage_tracking_gaps`.

## Supabase (Production)

The production database is hosted on Supabase Free tier. The `DATABASE_URL` connection string is available in the Supabase dashboard under **Project Settings → Database → Connection string → URI**.

Set it as a Fly.io secret:

```bash
fly secrets set DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
```

## Database Backups

Connect local pgAdmin to production database.
Use Tools->Backup in pgAdmin to save a local backup. 


## Migrations

Schema changes are tracked as numbered SQL files (`001_…`, `002_…`, etc.).
Apply them in order against the target database:

```powershell
psql -U postgres -d quickexpense -f app-server/db/001_initial_schema.sql
psql -U postgres -d quickexpense -f app-server/db/002_enable_rls_and_revoke_postgrest_access.sql
psql -U postgres -d quickexpense -f app-server/db/003_user_currencies.sql
psql -U postgres -d quickexpense -f app-server/db/004_rls_user_currencies.sql
psql -U postgres -d quickexpense -f app-server/db/005_user_custom_columns.sql
psql -U postgres -d quickexpense -f app-server/db/006_drop_column_config_tables.sql
psql -U postgres -d quickexpense -f app-server/db/007_user_column_visibility.sql
psql -U postgres -d quickexpense -f app-server/db/008_rls_user_column_visibility.sql
psql -U postgres -d quickexpense -f app-server/db/009_setup_shares.sql
psql -U postgres -d quickexpense -f app-server/db/010_rls_setup_shares.sql
psql -U postgres -d quickexpense -f app-server/db/011_reset_hidden_comment.sql
psql -U postgres -d quickexpense -f app-server/db/012_numeric_user_ids.sql
psql -U postgres -d quickexpense -f app-server/db/013_setup_field_defaults.sql
psql -U postgres -d quickexpense -f app-server/db/014_admin_usage_tracking.sql
```

> Migration 011 removes any previously hidden `Comment` entries — `Comment` is now a protected (non-hideable) field.
>
> Migration 013 adds owner setup-field defaults and seeds one row for each existing user. Migration 014 adds connection provenance and Admin usage tracking. It backfills `users.first_signed_in_at` from `created_at`, the available historical sign-in evidence; it intentionally does not treat previously saved spreadsheet IDs as validated connections because older flows could save unvalidated candidates.
>
> Apply all pending migrations in order, including 013 and 014, **before deploying the server build that starts Admin usage instrumentation**. This ensures the new tracking and provenance schema exists before the instrumented server starts.
