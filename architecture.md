# Quick Expense — Architecture Overview

> **Purpose of this document:** Serve as a single onboarding reference for both human developers and AI agents working on this codebase. It covers project structure, technology choices, data flow, authentication, data model, deployment, and key conventions.

---

## 1. What the Application Does

Quick Expense is a small web application for recording personal/family expenses on the go. Users authenticate with Google, connect a Google Spreadsheet as their "database", and then:

- **Add** an expense record (appended as a new row to the sheet).
- **Browse and filter expense history (History):** view the most recent records and search/filter by comment, category, amount range, and custom columns (client-side, after loading the full dataset).
- **Repeat** a past expense: tapping the Repeat action on a History record pre-fills the Add form with that record's data and today's date.

All expense data lives in the user's own Google Spreadsheet — the application never stores expense rows. The business requirements are documented in detail in `docs/QuickExpense_business-requirements.md`.

---

## 2. High-Level Architecture

The repository contains **two independently deployable artifacts** that share a single Git repo:

```
┌────────────────────────────────────────┐
│  Landing Page  (landing/)              │
│  Static HTML + vanilla JS              │
│  Served by nginx, deployed separately  │
│  Fly.io app: q-expense-landing         │
└────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  Main Application  (everything outside landing/)               │
│                                                                │
│  ┌─────────────────────┐     ┌──────────────────────────────┐  │
│  │  React SPA (app-web/)│────▶│  Express Backend (app-server/)│  │
│  │  Vite + TypeScript   │     │  Node.js, plain JS           │  │
│  │  Port 5173 (dev)     │     │  Port 3001                   │  │
│  └─────────────────────┘     └──────────┬───────────────────┘  │
│                                         │                      │
│                              ┌──────────▼───────────────────┐  │
│                              │  Google Sheets API v4        │  │
│                              │  Google OAuth 2.0            │  │
│                              └──────────────────────────────┘  │
│                                                                │
│  Fly.io app: q-expense-app                                     │
└────────────────────────────────────────────────────────────────┘
```

In production, the Express server also serves the Vite-built `dist/` directory as static files, so the SPA and API run on a single origin.

---

## 3. Folder Structure

```
quick-expense/
├── architecture.md            ← this file
├── Dockerfile                 ← production image for main app (Node 22 + npm build)
├── fly.toml                   ← Fly.io config for q-expense-app
├── index.html                 ← Vite entry HTML (SPA shell)
├── encrypt-tool.html          ← standalone utility page (encryption helper)
├── package.json               ← single package.json for both front-end and back-end
├── tsconfig.json               ← TypeScript config (covers app-web/ and tests/)
├── vite.config.ts             ← Vite + Vitest config, dev proxy /api → :3001
│
├── docs/
│   └── QuickExpense_business-requirements.md
│
├── landing/                   ← independent landing/marketing page
│   ├── Dockerfile             ← nginx:alpine image
│   ├── fly.toml               ← Fly.io config for q-expense-landing
│   ├── index.html             ← self-contained HTML + CSS + JS
│   └── lang/                  ← i18n language bundles
│       ├── en.js
│       ├── es.js
│       └── i18n.js            ← lightweight i18n runtime
│
├── public/                    ← static assets served by Vite / Express
│   ├── privacy-policy.html    ← required for Google OAuth app verification
│   └── terms-of-service.html  ← required for Google OAuth app verification
│
├── app-server/                ← Express back-end (plain JS, ES modules)
│   ├── index.js               ← app entry: routes, middleware, session setup
│   ├── db.js                  ← PostgreSQL connection pool (pg.Pool)
│   ├── google-client.js       ← Google OAuth helpers (PKCE, token exchange, refresh)
│   ├── google-sheets.js       ← Google Sheets API operations (validate, load, append)
│   ├── store.js               ← PostgreSQL-backed user record and FX backup persistence
│   ├── sharing.js             ← sharing CRUD: list/add/update/remove guest access
│   ├── email.js               ← Resend email sender (fire-and-forget delivery)
│   ├── email-templates.js     ← HTML + plain-text email templates for share/revoke notifications + error-alert/warning-digest alerts
│   ├── logger.js               ← winston logger (console + rotating file transports), size-cap sweep, error-alert/warning-digest scheduling, admin log file listing/tailing
│   ├── resilience.js          ← auth middleware (createRequireAuthenticatedUser, requireOwner, requireGuest, requireEditAccess, requireAppAdmin), health check, and graceful shutdown
│   ├── validation.js          ← server-side expense input validation
│   ├── utils.js               ← shared backend utilities
│   │
│   ├── config/                ← currency dictionary + Google service account credentials (used in production)
│   │   ├── currencies.json    ← currency dictionary (25 codes) + maxOptional limit
│   │   └── service-account.json ← Google service account credentials; committed to git with `private_key` replaced by the `${GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY}` placeholder (see README.md)
│   │
│   └── db/                    ← database schema and migration scripts
│       ├── 001_initial_schema.sql ← initial PostgreSQL schema (users, fx_rate_backups, sessions)
│       ├── 003_user_currencies.sql ← user_currencies table (configurable currencies per user)
│       └── database.md        ← database setup instructions
│
├── app-web/                    ← React SPA (TypeScript)
│   ├── main.tsx               ← ReactDOM entry, BrowserRouter
│   ├── App.tsx                ← top-level routes + context provider nesting
│   ├── index.css              ← global styles
│   ├── vite-env.d.ts
│   ├── components/            ← reusable UI components
│   │   ├── ExpenseTable.tsx   <- expense card list; tap/click to expand full details inline; optional Repeat button pre-fills Add form
│   │   ├── Layout.tsx         ← app shell: topbar + footer + page slot; Setup badge
│   │   ├── LoadingBlock.tsx   ← spinner component
│   │   ├── MonthDetailsPanel.tsx ← generic { records, toIso, startDate, endDate } drill-down panel: avg/day + category-vs-prior-month breakdown (reusable beyond Home MTD)
│   │   ├── MtdSpendChart.tsx  ← ECharts line/area chart for MTD daily spend (Home dashboard)
│   │   ├── ProtectedRoute.tsx ← redirect to login if unauthenticated
│   │   ├── StatusBanner.tsx   ← error/success/info banner
│   │   └── SharedConfigInvalidModal.tsx ← blocking modal shown when a guest's shared setup becomes invalid
│   ├── constants/
│   │   ├── expenses.ts        ← fixed header names, header builder, limits
│   │   └── feedback.ts        ← Google Forms feedback URL
│   ├── contexts/              ← React context providers (global state)
│   │   ├── AuthContext.tsx     ← authentication state + sign-in/sign-out
│   │   ├── ConfigContext.tsx   ← spreadsheet config state
│   │   └── DatasetContext.tsx  ← expense dataset loading, caching, surgical mutations
│   ├── pages/                 ← route-level page components
│   │   ├── AddExpensePage.tsx  <- expense form with currency conversion; accepts repeat record via React Router location state
│   │   ├── AuthCallbackPage.tsx ← post-OAuth redirect handler
│   │   ├── HomePage.tsx       ← spending dashboard (TODAY / MTD / YTD)
│   │   ├── LoginPage.tsx      ← sign-in screen
│   │   ├── HistoryPage.tsx    <- unified history: recent records + collapsible filter panel (comment, category, amount range, custom columns); Repeat navigates to /add with pre-filled state
│   │   └── SetupPage.tsx      ← spreadsheet URL configuration + Google Picker
│   ├── services/              ← API client layer
│   │   ├── authApi.ts         ← /api/auth/* calls
│   │   ├── currency.ts        ← manual FX rate parsing + conversion
│   │   ├── googlePicker.ts    ← Google Picker API integration
│   │   ├── googleSheets.ts    ← /api/config + /api/expenses calls
│   │   ├── http.ts            ← fetch wrappers with typed error handling
│   │   ├── metricsCache.ts    ← localStorage metrics cache for Home dashboard (key: qe_metrics_{email})
│   │   └── sharingApi.ts      ← /api/sharing/* calls (owner share management + guest reset)
│   ├── types/
│   │   └── expense.ts         ← all shared types and AppError class
│   └── utils/                 ← pure utility functions
│       ├── currencyTotals.ts  ← raw number parsing (US/EU formats) + per-day dual-currency totals
│       ├── dashboardStats.ts  ← TODAY / MTD / YTD aggregations, ISO normalizer, chart data
│       ├── date.ts            ← local date formatting + sheet date-format detection
│       ├── expenseTable.ts    ← expense card helpers: preview length, display amount, detail detection
│       ├── monthDetails.ts    ← average-per-day, prior-month range clamping, category breakdown/grouping for MonthDetailsPanel
│       ├── search.ts          ← client-side expense filtering
│       ├── setupStatus.ts     ← resolves Setup status banner state (loading/configured/needs-setup/invalid/load-error)
│       ├── spreadsheet.ts     ← header validation, row mapping, distinct values
│       ├── storage.ts         ← safe JSON localStorage helpers
│       └── validation.ts      ← expense draft validation, decimal parsing
│
└── tests/                     ← Vitest test files
    ├── client/                ← frontend tests (mirrors app-web/)
    │   ├── dashboard-stats.test.ts
    │   ├── metricsCache.test.ts
    │   ├── search.test.ts
    │   ├── spreadsheet.test.ts
    │   └── validation.test.ts
    └── server/                ← backend tests (mirrors app-server/)
        ├── server-validation.test.js
        └── store.test.js
```

---

## 4. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Front-end framework | React 18 + TypeScript | SPA, client-side routing via react-router-dom v6 |
| Build tool | Vite 7 | Dev server on port 5173, proxies `/api` to backend |
| Test runner | Vitest 4 + jsdom | `npm test` runs `vitest run` |
| Charts | echarts | ECharts powers the MTD line/area chart and category pie chart; MTD actual data uses straight daily segments and remaining current-month days use a gray forecast region |
| Icons | lucide-react | |
| Back-end runtime | Node.js 22, Express 4 | ES modules (`"type": "module"` in package.json) |
| Session management | express-session + connect-pg-simple | PostgreSQL-backed sessions |
| Data persistence | PostgreSQL (Supabase Free) | `users`, `fx_rate_backups`, `sessions` tables — see §7 |
| Database driver | pg (node-postgres) | Connection via `DATABASE_URL` env var |
| External API | Google Sheets API v4 | All CRUD on expense data |
| Authentication | Google OAuth 2.0 (Authorization Code + PKCE) | Server-side flow |
| Google Picker | Google Picker API | For spreadsheet selection in Setup |
| Deployment | Fly.io (Docker) | App container is otherwise stateless; a single 1GB volume is mounted at `/data/logs` for rotated log files only (see §11) |
| Landing page | Vanilla HTML/CSS/JS + nginx:alpine | Separate Fly.io app |
| Email | Resend (resend.com) | Transactional email for share/revoke notifications and error-alert/warning-digest emails; silently skipped if `RESEND_API_KEY` absent |
| Logging | winston + winston-daily-rotate-file | Console (JSON) + rotating combined/error log files, retention + size-cap sweep, admin-only in-app viewer |

### Runtime Version Baseline

- Development baseline: Node.js `22.12.0` (pinned in `.nvmrc`)
- Supported local range: `^22.12.0`
- Goal: keep test and build behavior consistent across Windows PowerShell and Command Prompt

---

## 5. Authentication & Session Flow

### 5.1 OAuth Flow (Server-Side)

```
Browser                          Express Backend               Google
  │                                    │                          │
  │  GET /api/auth/login               │                          │
  │───────────────────────────────────▶│                          │
  │  (generates PKCE pair + state,     │                          │
  │   stores in express-session)       │                          │
  │  302 Redirect ────────────────────────────────────────────────▶
  │                                    │   Google consent screen  │
  │  ◀────────────────────────────────────────────────────────────│
  │  GET /api/auth/callback?code=...   │                          │
  │───────────────────────────────────▶│                          │
  │                                    │  POST token exchange     │
  │                                    │─────────────────────────▶│
  │                                    │  { access_token,         │
  │                                    │    refresh_token }       │
  │                                    │◀─────────────────────────│
  │                                    │  GET userinfo            │
  │                                    │─────────────────────────▶│
  │                                    │  { email }               │
  │                                    │◀─────────────────────────│
  │                                    │                          │
  │  (stores tokens in PostgreSQL `users` table,                  │
  │   sets session.userEmail)          │                          │
  │  302 Redirect to /home             │                          │
  │◀───────────────────────────────────│                          │
```

### 5.2 Key Security Details

- **PKCE (S256):** Code verifier stored in server session, never exposed to the browser.
- **Tokens never sent to the browser:** Access tokens and refresh tokens are stored server-side in the PostgreSQL `users` table. The browser receives only an `httpOnly` session cookie.
- **CSRF protection:** All mutating requests require an `X-Requested-With: fetch` header, checked by middleware.
- **Token refresh:** `getAuthorizedAccessToken()` in `app-server/index.js` transparently refreshes expired access tokens using the stored refresh token before any Google API call.
- **Session cookie:** `httpOnly`, `sameSite: lax`, `secure` when HTTPS, 30-day expiry.

### 5.3 OAuth Scopes Requested

- `openid` — user identification
- `email` — retrieve user email
- `https://www.googleapis.com/auth/drive.file` — create files in Drive and access any file the user selects via the Google Picker

### 5.4 Session Lifecycle

- `GET /api/auth/session` — front-end polls this on startup to check if a valid session exists.
- `POST /api/auth/logout` — destroys the express-session.
- Session data is stored in the `sessions` table in PostgreSQL, managed by `connect-pg-simple`. Expired sessions are pruned automatically every 15 minutes.

---

## 6. API Endpoints

All API routes are defined in `app-server/index.js`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | No | Health check (`{ ok: true }`) |
| GET | `/api/auth/login` | No | Initiate Google OAuth (redirect) |
| GET | `/api/auth/callback` | No | OAuth callback (token exchange → session) |
| GET | `/api/auth/session` | No | Check current session status |
| POST | `/api/auth/logout` | No | Destroy session |
| GET | `/api/auth/picker-config` | Yes | Get access token + API key for Google Picker |
| GET | `/api/config` | Yes | Get user's configured spreadsheet |
| POST | `/api/config` | Yes | Save/validate spreadsheet URL |
| DELETE | `/api/config` | Yes | Remove spreadsheet configuration |
| POST | `/api/config/create-spreadsheet` | Yes | Copy template spreadsheet into user's Drive |
| GET | `/api/config/mapping` | Yes | Get current column mapping, config mode, and detected columns |
| POST | `/api/config/mapping` | Yes | Save column mapping to Config sheet (requires `confirmed: true`) |
| GET | `/api/sheet/modifiedtime` | Yes | Fetch the Drive `modifiedTime` timestamp of the configured spreadsheet. Returns `{ modifiedTime: string \| null }` — `null` when the file is not accessible via `drive.file` scope (e.g. shared-setup guests). Used by `HomePage` to validate the `localStorage` metrics cache. |
| GET | `/api/expenses` | Yes | Load recent expense records (Phase 1). Response includes `loadPhase` (`"full"` or `"recent"`), `startRow`, `totalRows`, and `hasDateOrderIssue` (boolean — true when at least one date row is out of chronological order). When `loadPhase` is `"recent"`, the client fetches the historical remainder via `/api/expenses/history`. |
| GET | `/api/expenses/history` | Yes | Load historical records older than the recent window. Query param: `endRow` (integer, last sheet row of the historical range). Response includes `loadPhase: "full"`. |
| POST | `/api/expenses` | Yes | Add a new expense row (append or insert depending on date); returns `201` + `{ record: ExpenseRecord, insertMode: boolean }`. `insertMode: true` means the row was inserted mid-sheet at the correct chronological position. |
| PUT | `/api/expenses/:rowNumber` | Yes | Save an edited expense row. If the date change would break chronological order, the row is repositioned (insert at correct position then delete original); returns `200` + `{ record: ExpenseRecord, moveMode: boolean }`. `moveMode: true` means the row was moved — client performs a full dataset reload. |
| DELETE | `/api/expenses/last` | Yes | Delete the last expense row (with row-count conflict check) |
| GET | `/api/fx-backup` | Yes | Get the latest saved FX rate backup |
| GET | `/api/fx/rates` | Yes | Fetch live market exchange rates for one or more non-USD currency codes (`?currencies=PLN,EUR`). Proxies `fawazahmed0/currency-api` via jsDelivr CDN (free, key-less, daily ECB rates). Returns `{ rates: { PLN: 4.03 }, date: "2026-06-25" }`. On upstream failure returns 503. |
| GET | `/api/currencies/available` | Yes | Get the currency dictionary (all supported codes + max limit) |
| GET | `/api/currencies` | Yes | Get the user's active currency codes |
| PUT | `/api/currencies` | Yes | Save user's currency selection and update sheet columns |
| PATCH | `/api/config/column-visibility` | Yes (owner) | Toggle visibility of a column on the Add Expense form (`{ field, hidden }`) |
| GET | `/api/sharing` | Yes (owner) | List all users shared with this owner |
| POST | `/api/sharing` | Yes (owner) | Add a user to the share list (`{ guestEmail, accessLevel }`) |
| PATCH | `/api/sharing/:guestEmail` | Yes (owner) | Update access level for a shared user |
| DELETE | `/api/sharing/:guestEmail` | Yes (owner) | Remove a user from the share list |
| POST | `/api/sharing/guest/reset` | Yes (guest) | Guest-initiated reset: detach from shared setup and clear to re-run Setup |
| GET | `/api/admin/logs/files` | Yes (app admin) | List rotated log files (name/size/mtime) from `LOG_DIR` |
| GET | `/api/admin/logs/tail` | Yes (app admin) | Tail/filter a whitelisted log file. Query params: `file` (must be a name returned by `/files`), `level`, `q` (substring search), `lines` (default 200, max 1000) |
| GET | `/logs` | Yes (app admin) | Serves the admin log viewer HTML page (`app-server/views/logs.html`) |
| GET | `/logs.js` | Yes (app admin) | Serves the admin log viewer's client script (`app-server/views/logs.js`) |

"Auth = Yes" means the `requireAuthenticatedUser` middleware is applied: it verifies the session cookie has a `userEmail`, retrieves the user record, resolves any shared setup reference (populating `req.configRecord`, `req.isGuest`, `req.accessLevel`), and attaches them to the request. "owner" routes additionally require `requireOwner` (403 for guests). Write expense routes additionally require `requireEditAccess` (403 for view-level guests). "app admin" routes additionally require `requireAppAdmin` (403 unless the signed-in user's email is listed in the `ADMIN_EMAIL` or `ALERT_EMAIL_TO` env var, comma/semicolon-separated) — a separate, app-wide admin gate distinct from spreadsheet ownership.

---

## 7. Data Model & Storage

### 7.1 PostgreSQL Database (Supabase Free)

The backend uses **PostgreSQL** (hosted on Supabase Free tier) for all server-side state. Schema scripts live in `app-server/db/`. The connection is managed via `app-server/db.js` using `pg.Pool` configured from the `DATABASE_URL` environment variable.

#### a) `users` Table

Stores authenticated user records: OAuth tokens, spreadsheet configuration, and activity timestamps.

| Column | Type | Constraints |
|---|---|---|
| `id` | BIGINT | PRIMARY KEY, GENERATED ALWAYS AS IDENTITY |
| `email` | TEXT | NOT NULL, UNIQUE |
| `access_token` | TEXT | NOT NULL |
| `access_token_expires_at` | BIGINT | NOT NULL |
| `refresh_token` | TEXT | |
| `spreadsheet_url` | TEXT | |
| `spreadsheet_id` | TEXT | |
| `last_authenticated_at` | BIGINT | NOT NULL |
| `last_activity_at` | BIGINT | NOT NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

- `id` is the stable numeric primary key used by all relational ownership foreign keys. Email remains unique and is used for login and guest invitation lookup.
- Token-related BIGINT fields store epoch milliseconds (matching `Date.now()` in JavaScript).
- `created_at`/`updated_at` use TIMESTAMPTZ for operational observability.

#### b) `fx_rate_backups` Table

Stores FX rate conversion rates from expense submissions. One row per currency per submission (normalized from the previous JSONB approach). Used to pre-fill FX rates on the Add Expense form.

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `user_id` | BIGINT | NOT NULL, FK → users(id) |
| `spreadsheet_id` | TEXT | |
| `expense_date` | DATE | NOT NULL |
| `currency_code` | VARCHAR(3) | NOT NULL, CHECK length = 3 |
| `fx_rate` | NUMERIC(12,6) | NOT NULL |
| `submitted_at` | TIMESTAMPTZ | NOT NULL |

- Index on `(user_id, spreadsheet_id, submitted_at DESC)` for efficient latest-backup lookup.
- A single backup submission with rates for any configured currencies creates one row per currency sharing the same `submitted_at` value.
- Currency amounts are not stored (they are not read back by the frontend).

#### c) `sessions` Table

Managed automatically by `connect-pg-simple`. Stores express-session data.

| Column | Type | Constraints |
|---|---|---|
| `sid` | VARCHAR | PRIMARY KEY |
| `sess` | JSON | NOT NULL |
| `expire` | TIMESTAMPTZ(6) | NOT NULL, indexed |

- Expired sessions are pruned automatically every 15 minutes by `connect-pg-simple`.

#### d) `user_currencies` Table

Stores each user's configurable (non-USD) currency selections with an audit trail.

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `user_id` | BIGINT | NOT NULL, FK → users(id) |
| `currency_code` | VARCHAR(3) | NOT NULL |
| `added_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `removed_at` | TIMESTAMPTZ | NULL |

- Unique partial index on `(user_id, currency_code) WHERE removed_at IS NULL` prevents duplicates among active currencies.
- When a user removes a currency, `removed_at` is set (soft-delete). The column remains in the spreadsheet for historical data.
- On first load, if no records exist for a user, active currencies are auto-seeded from the sheet's existing header columns (legacy migration).

#### e) `user_custom_columns` Table

Stores custom column metadata for a user's spreadsheet setup.

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `user_id` | BIGINT | NOT NULL, FK → users(id) |
| `column_name` | VARCHAR(30) | NOT NULL |
| `position` | SMALLINT | NOT NULL |
| `added_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `removed_at` | TIMESTAMPTZ | NULL |

- Unique partial index on `(user_id, lower(column_name)) WHERE removed_at IS NULL` prevents duplicate active columns.

#### f) `user_column_visibility` Table

Stores per-user, per-spreadsheet column visibility preferences for the Add Expense form. A row's presence means the column is hidden; absence means visible.

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `user_id` | BIGINT | NOT NULL, FK → users(id) |
| `spreadsheet_id` | TEXT | NOT NULL |
| `canonical_field_name` | VARCHAR(30) | NOT NULL |
| `hidden_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

- Unique index on `(user_id, spreadsheet_id, canonical_field_name)` prevents duplicate entries.
- Keyed by canonical QE field name (e.g. `"Comment"`, `"PLN"`) so column renames via the Setup UI automatically migrate the preference via `renameVisibilityEntry()`.
- Only hideable columns may be toggled: `Date`, `USD`, and `Category` are never hidden (rejected at the API layer). `Spent By` and `Spent For` are mandatory fields but may still be hidden as a pair from the Add Expense form — both default to the signed-in user's email so validation still passes without visible input.
- Tail and Search always show all columns regardless of visibility preferences.

#### g) `setup_shares` Table

Stores sharing relationships between an owner user and their invited guests.

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `owner_user_id` | BIGINT | NOT NULL, FK → users(id) ON DELETE CASCADE |
| `guest_email` | TEXT | NOT NULL |
| `access_level` | VARCHAR(4) | NOT NULL, CHECK IN ('view','edit') |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| | | UNIQUE (owner_user_id, guest_email) |

- `guest_email` has no FK — an invited user may not have signed in yet.
- `ON DELETE CASCADE` on `owner_user_id` means all guest references are automatically removed when an owner is deleted.
- Index on `(guest_email)` for efficient per-request guest resolution.
- Access levels: `edit` — full read/write; `view` — read-only (History allowed; Add/Edit/Delete blocked at API and UI level).

### 7.2 Expense Data — Google Spreadsheet

**Expense data is NOT stored in the backend.** It lives entirely in a Google Spreadsheet controlled by the user.

Required structure:
- Sheet name: `Expenses`
- Header row (dynamic order):

| Date | *[user-configured currencies]* | USD | Category | WhoSpent | ForWhom | Comment | PaymentChannel | Theme |
|---|---|---|---|---|---|---|---|---|

- Currency columns between Date and USD are user-configurable (up to 3 non-USD currencies from a dictionary of 25).
- New currency columns are inserted before USD via Sheets batchUpdate `insertDimension`. Removed currencies keep their columns in-place for historical data (never deleted).
- Auto-created if the sheet is empty on Setup.
- Legacy column order (USD/EUR swapped from original PLN/BYN/USD/EUR layout) is auto-migrated.
- Header validation occurs on Setup and before every Add and History load.
- Append uses Google Sheets API `values:append` with `INSERT_ROWS`.
- Load reads a dynamic column range `Expenses!A:{lastColumn}`, maps rows to `ExpenseRecord` objects with a `currencyAmounts` map.
- Dataset payload size is capped at **10 MB** (calculated as JSON byte size of all records). If exceeded, History is denied with an explanatory error message.

#### Config Sheet (Optional)

A second sheet named `Config` may exist in the same spreadsheet. It stores column mapping configuration in a simple key-value layout:

| Row | Column A | Column B |
|---|---|---|
| 1 | `schema_version` | `1` |
| 2 | `column_mapping` | JSON object mapping QE field names → user column names |

Example `column_mapping` value: `{"USD":"Amount","Spent By":"WhoSpent","Comment":"Notes"}`

#### Three Configuration Modes

The system detects the Config sheet state via `detectConfigSheet()` and operates in one of three modes:

| Mode | Condition | Behavior |
|---|---|---|
| `default` | No Config sheet exists | Standard header validation; columns must match QE field names directly |
| `config-driven` | Config sheet has valid `schema_version` = 1 and parseable `column_mapping` | Mapping is applied: user-facing column names in the sheet are translated to QE field names at read/write time |
| `config-invalid` | Config sheet exists but is malformed (missing version, bad JSON, etc.) | Setup UI warns the user; the mapping cannot be used until corrected |

### 7.3 Database Schema Management

Schema scripts are stored in `app-server/db/` as numbered SQL files (`001_initial_schema.sql`, etc.). Apply them in order against the target PostgreSQL instance. See `app-server/db/database.md` for setup instructions.

Current migrations:

| File | Purpose |
|---|---|
| `001_initial_schema.sql` | `users`, `fx_rate_backups`, `sessions` tables |
| `002_enable_rls_and_revoke_postgrest_access.sql` | RLS + PostgREST lockdown for initial tables |
| `003_user_currencies.sql` | `user_currencies` table |
| `004_rls_user_currencies.sql` | RLS policy for `user_currencies` |
| `005_user_custom_columns.sql` | Custom column support |
| `006_drop_column_config_tables.sql` | Cleanup of superseded config tables |
| `007_user_column_visibility.sql` | `user_column_visibility` table |
| `008_rls_user_column_visibility.sql` | RLS policy for `user_column_visibility` |
| `009_setup_shares.sql` | `setup_shares` table |
| `010_rls_setup_shares.sql` | RLS policy for `setup_shares` |
| `011_reset_hidden_comment.sql` | Remove hidden Comment entries |
| `012_numeric_user_ids.sql` | Re-key users and ownership foreign keys to numeric IDs |

---

## 8. Front-End Architecture

### 8.1 State Management — React Context Providers

The SPA uses three nested context providers (wrapped in `App.tsx`):

```
<AuthProvider>          ← authentication state, sign-in/out methods
  <ConfigProvider>      ← spreadsheet config (loaded from backend on session init)
    <DatasetProvider>   ← expense dataset: load, cache, mutate, search filters
      <Routes>
```

- **AuthContext:** Checks `/api/auth/session` on mount. Exposes `status` (`initializing` | `signed_out` | `signed_in`), `session` (email + timestamps), `signIn()`, `signOut()`, `refreshSession()`.
- **ConfigContext:** Fetches `/api/config` when a session is present. Exposes the `SpreadsheetConfig` object and methods to save/clear/refresh. The config includes a `configMode` field (`"default"` | `"config-driven"` | `"config-invalid"`) indicating whether a column mapping is active. When `configMode` is `"config-invalid"`, a `configModeReason` string explains the problem. `hiddenColumns: string[]` lists canonical field names hidden from the Add Expense form; `toggleColumnVisibility(field, hidden)` updates this list optimistically with server sync and automatic revert on failure.
- **DatasetContext:** Manages the loaded expense dataset. Key behaviors:
  - `loadDataset()` — fetches from `/api/expenses` unless a valid cached snapshot exists. Called on Home page mount (when status is `idle`) as well as by the History page. Concurrent callers join the in-flight Promise instead of starting a duplicate request. A generation counter ensures stale Phase-2 results are discarded if a reload was triggered in the meantime.
  - Two-phase progressive load: Phase 1 (blocking) fetches the configurable recent window and sets `status = "ready"` — the UI becomes interactive. If the server returns `loadPhase: "recent"`, Phase 2 immediately fires a background call to `/api/expenses/history` to retrieve older records and merges them into the snapshot when complete. Phase 2 failures are silently swallowed (recent window remains available).
  - `isLoadingHistory` — boolean exposed in context; `true` while the Phase-2 background fetch is in progress. The History page displays a non-blocking info banner while this is `true`.
  - `invalidateDataset()` — marks the snapshot stale, forcing a full reload on the next History/Home visit. Reserved for error-recovery and future external-change detection scenarios.
  - `reloadDataset()` — explicit Reload button action, force-fetches regardless of cache.
  - `appendToDataset(record)` — called after a successful Add in append mode; appends the returned `ExpenseRecord` to the in-memory array and recomputes `distinctValues`. No full reload.
  - After a successful Add in insert mode (`insertMode: true` from the API), a full `reloadDataset()` is triggered instead of a surgical append — row numbers for shifted rows would otherwise be stale.
  - `updateInDataset(record)` — called after a successful Edit; replaces the matching record (by `rowNumber`) and recomputes `distinctValues`. No full reload.
  - `removeLastFromDataset()` — called after a successful Delete (last row); removes the last entry from the in-memory array and recomputes `distinctValues`. No full reload.
  - All three mutation methods are no-ops when the snapshot has not yet been loaded.
  - After any surgical mutation, `HomePage.tsx` recomputes all dashboard metrics via its `useMemo` hooks and rewrites the `localStorage` metrics cache (`qe_metrics_{email}`) immediately — no reload, no "Refreshing…" indicator.
  - `DatasetSnapshot.hasDateOrderIssue` — boolean set on every load by scanning the date column. When `true`, `Layout.tsx` renders a persistent red banner on all screens prompting the user to sort their sheet. The banner disappears automatically on the next clean reload.
  - Shared between Home and History pages (they reuse the same in-memory dataset).
  - Holds `searchFilters` state (`SearchFilters`: `comment`, `categories`, `amountFrom`, `amountTo`, `spentBy`, `spentFor`, `customFields`) so History page filter values persist across navigation.

### 8.2 Routing

| Path | Component | Protected | Description |
|---|---|---|---|
| `/` | `LoginPage` | No | Sign-in screen (redirects to `/home` if already authenticated) |
| `/auth/callback` | `AuthCallbackPage` | No | Post-OAuth redirect (immediately navigates to `/home`) |
| `/home` | `HomePage` | Yes | Spending dashboard (TODAY / MTD / YTD metric cards + mini chart) |
| `/setup` | `SetupPage` | Yes | Spreadsheet configuration + Google Picker |
| `/add` | `AddExpensePage` | Yes | New expense form |
| `/tail` | — | — | Legacy route — redirects to `/home` |
| `/search` | — | — | Legacy route — redirects to `/home` |
| `/history` | `HistoryPage` | Yes | Recent records + optional filtering (comment, category, amount, custom columns); Repeat button pre-fills `/add` via Router state |

`ProtectedRoute` wraps all "Yes" routes — redirects to `/` if `auth.session` is null.

### 8.3 Service Layer

Frontend services in `app-web/services/` are thin wrappers around `fetch`:

- **`http.ts`** — `requestJson<T>()` and `requestNoContent()`: attach credentials, `X-Requested-With` header, parse errors into typed `AppError`.
- **`authApi.ts`** — session check, login redirect, logout.
- **`googleSheets.ts`** — config CRUD, expense load/append, FX rate backup, column visibility toggle.
- **`googlePicker.ts`** — loads Google Picker script, opens file picker dialog.
- **`currency.ts`** — manual FX rate parsing and USD conversion logic.
- **`metricsCache.ts`** — `localStorage` cache for Home dashboard metrics (`qe_metrics_{email}`). Stores pre-computed `TodayStats`, `PeriodStats` (MTD/YTD/Rolling12M), chart daily amounts, `sheetLastModifiedTime`, and a `ytdForecast` (now including a `deviation` field comparing the forecast to last year's actual full-year total, same shape as the other `PeriodStats.deviation` fields). Entries are **not** expired at midnight — `load()` returns cross-day entries so `HomePage` can render them immediately while refreshing; only a `spreadsheetId` mismatch or a failed sanitize evicts. Cleared on sign-out and config clear; entries also carry a `schemaVersion` (currently `8`) and are discarded as a cache miss on mismatch, safely invalidating stale shapes without a migration.
- **`sharingApi.ts`** — `/api/sharing/*` calls: list/add/update/remove shared users (owner); guest reset.

### 8.4 Key Front-End Conventions

- **TypeScript strict mode** with `moduleResolution: Bundler`.
- Types are centralized in `app-web/types/expense.ts` — includes `ExpenseDraft`, `ExpenseRecord`, `SpreadsheetConfig`, `CurrencyDictionary`, `AuthSession`, `SearchFilters`, `DatasetSnapshot`, `AppError`.
- Constants (fixed header names, `buildExpenseHeaders()`, limits) are in `app-web/constants/expenses.ts`.
- Pure utility functions are in `app-web/utils/` — validation, search filtering, spreadsheet helpers, date formatting.
- No CSS framework — global styles in `app-web/index.css`.
- Icons via `lucide-react`.

---

## 9. Landing Page (Separate Application)

The `landing/` directory is a **completely independent static site** — no build step, no shared dependencies with the main app.

- **Technology:** Single `index.html` with embedded CSS and inline JavaScript.
- **i18n:** Vanilla JS runtime (`lang/i18n.js`) loads language bundles (`lang/en.js`, `lang/es.js`) preloaded via `<script>` tags. Language detection: saved preference → browser language → English default.
- **Deployment:** Served by `nginx:alpine` Docker image. Deployed to Fly.io as `q-expense-landing` (Frankfurt region), separate from the main app.
- **Purpose:** Marketing/informational page describing the product. Contains CTA links that point to the main application URL for sign-in.

---

## 10. Build, Dev & Test

### Scripts (`package.json`)

| Command | What it does |
|---|---|
| `npm run dev` | Starts backend (`node app-server/index.js`) and Vite dev server concurrently |
| `npm run dev:client` | Vite dev server only (port 5173) |
| `npm run dev:server` | Express backend only (port 3001) |
| `npm run build` | `tsc -b && vite build` → outputs to `dist/` |
| `npm test` | `vitest run` (search, validation, spreadsheet, store tests) |

### Development Proxy

In development, Vite proxies all `/api` requests to `http://localhost:3001` (configured in `vite.config.ts`). This avoids CORS issues and mirrors the production single-origin setup.

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (e.g. `http://localhost:3001/api/auth/callback`) |
| `GOOGLE_API_KEY` | API key for Google Picker |
| `FRONTEND_BASE_URL` | Base URL where the SPA is served (e.g. `http://localhost:5173`) |
| `SESSION_SECRET` | Secret for express-session cookie signing |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/db`) |
| `EXPENSE_RECENT_MONTHS` | *(Optional)* Number of months of recent expense data loaded in Phase 1. Default: `24`. Older records are fetched in the background after the UI is ready. |
| `RESEND_API_KEY` | *(Optional)* Resend API key for transactional email. If absent, email notifications are silently skipped (app runs normally). |
| `EMAIL_FROM` | *(Optional)* Sender address for email notifications (e.g. `noreply@send.q-expense.com`). Required when `RESEND_API_KEY` is set. |
| `ADMIN_EMAIL` | *(Optional)* Email(s) allowed to access `/logs` and the `/api/admin/logs/*` routes (`requireAppAdmin`). Comma/semicolon-separated; combined with `ALERT_EMAIL_TO` into a single allow-list. Admin routes 403 when the signed-in user's email is in neither. |
| `ALERT_EMAIL_TO` | *(Optional)* Comma/semicolon-separated recipient list for error-alert and warning-digest emails. Alert emails are skipped when unset. |
| `LOG_DIR` | *(Optional)* Directory for rotated log files. Defaults to a repo-relative `logs/` folder; set to `/data/logs` in production (mounted volume). |
| `LOG_RETENTION_DAYS` | *(Optional)* Days to retain rotated log files. Default: `15`. |
| `LOG_MAX_TOTAL_MB` | *(Optional)* Total log directory size cap in MB; oldest files are swept on each rotation once exceeded. Default: `50`. |
| `ALERT_ERROR_THROTTLE_MS` | *(Optional)* Minimum time between error-alert emails, in milliseconds. Default: `300000` (5 min). |
| `ALERT_WARNING_DIGEST_INTERVAL_HOURS` | *(Optional)* How often the warning-digest email is sent (only if warnings occurred). Default: `24`. |
| `ALERT_EMAIL_SUBJECT_PREFIX` | *(Optional)* Subject line prefix for alert emails. Default: `[QuickExpense Alert]`. |

The backend validates all required env vars at startup and fails fast if any are missing. `EXPENSE_RECENT_MONTHS`, `RESEND_API_KEY`, `EMAIL_FROM`, and the logging/alerting vars above are optional; missing values generate a startup warning (or silently disable the feature) but do not fail the process.

---

## 11. Deployment

### Logging Context

Every Winston log entry receives `requestId` from the request context, plus numeric `userId`. Anonymous and unauthenticated entries use `userId: 0`. Shared-setup requests also receive `ownerUserId` for the configured setup owner; the field is omitted when the acting user owns their own setup. The same fields are included in error alerts and warning-digest samples. Email remains available for authentication and API response contracts, but is not used as a log identity.

### Main App (`q-expense-app`)

- **Dockerfile:** Multi-stage: install all deps → `npm run build` → prune to production deps → run `node app-server/index.js`.
- **Fly.io config (`fly.toml`):**
  - Region: `fra` (Frankfurt)
  - A single 1GB volume (`qe_logs`) is mounted at `/data/logs` — the sole exception to the otherwise-stateless container; it holds rotated log files only (`LOG_DIR=/data/logs`). All other state remains in the PostgreSQL database (Supabase).
  - Single shared-cpu-1x VM (256 MB), always running (`auto_stop_machines = off`, `min_machines_running = 1`).
  - Forces HTTPS.
  - `NODE_ENV=production`, `PORT=3001`, plus the `LOG_*`/`ALERT_*` env vars (see §10).
  - `DATABASE_URL`, `ADMIN_EMAIL`, and `ALERT_EMAIL_TO` set as Fly.io secrets.

### Admin Log Viewer

- `app-server/views/logs.html` (served at `GET /logs`) is a standalone vanilla-JS/CSS page (no React/build dependency), kept outside `public/`/`dist/` so it is never served as a static asset — it's only reachable via the guarded Express route below. Its client script (`logs.js`) is served at `GET /logs.js`.
- It calls `GET /api/admin/logs/files` and `GET /api/admin/logs/tail` to tail rotated log files with a severity filter and substring search.
- `/logs`, `/logs.js`, and both API routes require `requireAuthenticatedUser` + `requireAppAdmin` (email must be listed in `ADMIN_EMAIL` or `ALERT_EMAIL_TO`); the API routes additionally have a dedicated `express-rate-limit` limiter as defense in depth.
- The tail route validates the requested `file` against the list returned by the files route (whitelist check) to block path traversal — no arbitrary filesystem reads are possible.

### Landing Page (`q-expense-landing`)

- **Dockerfile:** Copies `index.html` and `lang/` into nginx default content directory.
- **Fly.io config:** Region `fra`, auto-stop on idle (zero cost when no traffic), no persistent storage needed.

---

## 12. Key Design Decisions & Constraints (v1)

1. **PostgreSQL via Supabase Free** — user records, FX rate backups, and sessions are stored in a managed PostgreSQL database. The app container is otherwise stateless, with one narrow exception: a 1GB Fly.io volume mounted at `/data/logs` holds rotated application log files (see §11).
2. **Expense data in Google Sheets only** — the app is a thin client over Google Sheets API. No expense data is cached or stored server-side.
3. **Client-side search** — the full dataset is loaded into the browser. Capped at 10 MB JSON payload.
4. **Edit of existing records** — supported via `PUT /api/expenses/:rowNumber`. Returns `{ record, moveMode }`. When the date change keeps the row in chronological order, an in-place cell update is performed (`moveMode: false`). When the date change would break order, `moveExpenseRow` calls the existing `addExpenseRow` (insert/append decision fully reused), then deletes the original row (`moveMode: true`). The client performs a full dataset reload on `moveMode: true`, identical to the add insert-mode flow. Delete is scoped to the **last row only**, available from Tail view. Protected by a row-count conflict check: the client passes the expected row count; the backend rejects with HTTP 409 if the sheet was updated concurrently.
5. **No duplicate detection** — each Save appends a new row unconditionally.
6. **Currency:** Users configure up to 3 non-USD currencies from a dictionary of 25 (stored in `app-server/config/currencies.json` and `user_currencies` DB table). At most one non-USD currency at a time per expense, optionally alongside USD. Manual FX rate entry is primary; when the form date is today, a live market rate hint is fetched via `GET /api/fx/rates` (proxied from `fawazahmed0/currency-api` — free, key-less, daily rates) and displayed as a tappable *"Market: X.XX"* hint. Silent fallback to fully manual entry on any upstream failure. Archived currency columns remain in the sheet.
7. **No pagination** — search results capped at 100.
8. **Single sheet named "Expenses"** — no multi-sheet support.
9. **Concurrency** — relies on Google Sheets API atomic append; no manual row indexing.
10. **Session duration** — cookie lasts 30 days; business rule targets 24-hour re-auth, enforced by token expiry + refresh.
11. **No auto-creation of Config sheet** — the Config sheet is created only when the user explicitly saves a column mapping via `POST /api/config/mapping`. It is never auto-created during setup or validation flows.
12. **Explicit consent gate for column mapping** — `POST /api/config/mapping` requires `confirmed: true` in the request body. This prevents accidental overwrites of existing Config sheet data from programmatic or double-submit scenarios.
13. **Two-path setup model** — users choose between (a) creating a fresh spreadsheet from a template (default mode, no Config sheet) or (b) connecting an existing spreadsheet and optionally configuring a column mapping (config-driven mode). This design separates simple onboarding from advanced customization.
14. **Home screen is a spending dashboard** — when a user is authenticated and has expense data, `/home` renders three metric cards: TODAY (today's entries + dual-currency display), JUNE SO FAR (MTD total + YoY deviation + mini ECharts line/area chart), and YEAR SO FAR (YTD total + YoY deviation). Dashboard data comes from `DatasetContext.loadDataset()` — no extra API call; in-memory cache is reused if valid. All aggregations cover all rows (all `WhoSpent` values). The MTD chart uses exact straight daily cumulative segments and points; current-month actual data extends through the later of today or the latest dated expense, while the remaining days are shown as a gray forecast region. Completed months are entirely actual. Implemented in `app-web/utils/dashboardStats.ts` and `app-web/components/MtdSpendChart.tsx`.
15. **Setup status badge** — `Layout.tsx` overlays a green ✓ (`CheckCircle`) or red ⚠ (`AlertCircle`) badge on the Setup gear icon in the global bottom nav. Badge is computed from `ConfigContext.config.configMode`: green = sheet connected and valid; red = no sheet, or `configMode === 'config-invalid'`.
16. **Two-phase progressive dataset load** — `GET /api/expenses` binary-searches the date column (`findExpenseStartRow`); with ≥20 historical rows it returns only the last `EXPENSE_RECENT_MONTHS` months (default 24) in Phase 1, then the client (`DatasetContext`) fetches the remainder via `GET /api/expenses/history?endRow=N` in the background. `DatasetSnapshot.loadPhase` (`"recent"` | `"full"`) tracks completion.

17. **USD is mandatory when a non-USD amount is provided** — if a non-USD amount is entered with USD empty and no FX rate to derive it, both the Add form and the backend (`validateUsdMandatory()` in `app-server/validation.js`, HTTP 400) reject it.

18. **Setup sharing model** — an owner shares their full config (spreadsheet, currencies, column visibility) via `POST /api/sharing`; guests store a DB reference to the owner record (no data duplicated). `requireAuthenticatedUser` resolves the reference on every request. `edit` guests have full read/write; `view` guests are read-only (writes blocked at API + UI). Guests cannot modify Setup. When an owner's config becomes invalid, guests see a blocking `SharedConfigInvalidModal`.

19. **Append vs. insert mode for new expenses** — `POST /api/expenses` reads the date column first: dates ≥ last row (or no data / bad format / out-of-order) append via `appendExpenseRow`; an earlier date on a well-ordered sheet inserts at the correct position via `addExpenseRow` (client does a full reload after insert). `alignValuesToHeaders()` handles legacy ordering + column mapping on both paths.

20. **Month details drill-down** (issue #89) — `MonthDetailsPanel.tsx`, a deliberately generic (`{ records, toIso, startDate, endDate }`) expand/collapse panel below the MTD chart, reusable by a future YTD consumer. The category table includes each displayed row's share of the displayed current-month total, formatted to one fractional digit and right-aligned; a zero displayed total renders 0.0%. All other math lives in `app-web/utils/monthDetails.ts`, computed via `useMemo` from the in-memory dataset — no API/DB changes. `CategoryPieChart.tsx` labels only the `MAX_PIE_LABELS` (10) largest slices — beyond that callouts overlap unreadably — and surfaces per-slice details (name / amount / share) via a click-or-tap ECharts tooltip; this supersedes the read-only, `silent: true` decision from issue #94.

21. **Row repositioning on edit** — `PUT /api/expenses/:rowNumber` delegates to `moveExpenseRow` (`app-server/google-sheets.js`): in-place `updateExpenseRow` when the new date keeps the row between its neighbors, else `addExpenseRow` then delete the original (insert-before-delete = no data loss). Client reloads on `moveMode: true`, identical to insert-mode add.

22. **Home screen metrics cache (`localStorage`)** — dashboard metrics are cached under `qe_metrics_{email}` for instant Home render, including across days: a cross-day entry is rendered immediately in a dimmed state with an `Updating… · as of <date>` hint, while the TODAY widget (and MTD, when the cache predates the current month) shows an `Updating…` placeholder instead of figures a date rollover has invalidated. Freshness is checked via `GET /api/sheet/modifiedtime` (within `drive.file` scope) **only for same-day cache**; a cross-day cache refreshes unconditionally, since the Drive check cannot vouch for period-relative metrics. Invalidated on sign-out, config clear, spreadsheet relink, and when Drive `modifiedTime` exceeds the stored timestamp. Surgical CRUD mutations rewrite the cache optimistically. Guests and URL-pasted spreadsheets get `modifiedTime: null` and fall back to a full reload (no same-day cache benefit).

23. **Transactional email for share/revoke events** — dispatched via Resend after the HTTP response (fire-and-forget); failures are logged, never surfaced to the UI. Templates in `app-server/email-templates.js`. Silently skipped when `RESEND_API_KEY` is absent.

24. **"Spent For" mandatory fixed column** — `Spent For` (ForWhom) sits between `Spent By` and `Comment` in the canonical header (server `parseSheetStructure`, client `expense.ts`), required by `validateRequiredFields()` and the Add form. Individually hideable like `Spent By` (both default to the signed-in user's email so hidden-field validation passes). History has matching `Spent By`/`Spent For` substring filters.
