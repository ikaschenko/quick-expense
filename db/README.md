# Database Setup

Quick Expense uses PostgreSQL (hosted on Supabase Free tier in production).

## Initial Setup

Run the schema script against your database:

```bash
psql "$DATABASE_URL" -f db/001_initial_schema.sql
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
   psql -U postgres -d quickexpense -f db/001_initial_schema.sql
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
psql "postgresql://postgres:postgres@localhost:5432/quickexpense" -f db/001_initial_schema.sql
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

You should see three tables: `users`, `fx_rate_backups`, and `sessions`.

## Supabase (Production)

The production database is hosted on Supabase Free tier. The `DATABASE_URL` connection string is available in the Supabase dashboard under **Project Settings → Database → Connection string → URI**.

Set it as a Fly.io secret:

```bash
fly secrets set DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
```

## Migrations

Schema changes are tracked as numbered SQL files (`001_…`, `002_…`, etc.).
Apply them in order against the target database.
