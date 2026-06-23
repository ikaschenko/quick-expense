# Quick Expense — Architecture Overview

> **Purpose of this document:** Serve as a single onboarding reference for both human developers and AI agents working on this codebase. It covers project structure, technology choices, data flow, authentication, data model, deployment, and key conventions.

---

## 1. What the Application Does

Quick Expense is a small web application for recording personal/family expenses on the go. Users authenticate with Google, connect a Google Spreadsheet as their "database", and then:

- **Add** an expense record (appended as a new row to the sheet).
- **Tail** the last 20 rows.
- **Search** across category and comment fields (client-side, after loading the full dataset from the Google Sheets API).

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
│  │  React SPA (src/)   │────▶│  Express Backend (server/)   │  │
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
├── Dockerfile                 ← production image for main app (Node 20 + npm build)
├── fly.toml                   ← Fly.io config for q-expense-app
├── index.html                 ← Vite entry HTML (SPA shell)
├── encrypt-tool.html          ← standalone utility page (encryption helper)
├── package.json               ← single package.json for both front-end and back-end
├── tsconfig.json              ← TypeScript config (covers src/ and tests/)
├── vite.config.ts             ← Vite + Vitest config, dev proxy /api → :3001
│
├── config/                    ← runtime data directory (local dev only, not used in production)
│   └── .gitkeep
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
├── config/
│   └── currencies.json        ← currency dictionary (25 codes) + maxOptional limit
│
├── db/                        ← database schema and migration scripts
│   ├── 001_initial_schema.sql ← initial PostgreSQL schema (users, fx_rate_backups, sessions)
│   ├── 003_user_currencies.sql ← user_currencies table (configurable currencies per user)
│   └── README.md              ← database setup instructions
│
├── server/                    ← Express back-end (plain JS, ES modules)
│   ├── index.js               ← app entry: routes, middleware, session setup
│   ├── db.js                  ← PostgreSQL connection pool (pg.Pool)
│   ├── google-client.js       ← Google OAuth helpers (PKCE, token exchange, refresh)
│   ├── google-sheets.js       ← Google Sheets API operations (validate, load, append)
│   ├── store.js               ← PostgreSQL-backed user record and FX backup persistence
│   ├── sharing.js             ← sharing CRUD: list/add/update/remove guest access
│   ├── email.js               ← Resend email sender (fire-and-forget delivery)
│   ├── email-templates.js     ← HTML + plain-text email templates for share/revoke notifications
│   ├── resilience.js          ← retry + backoff helpers for external API calls
│   ├── validation.js          ← server-side expense input validation
│   └── utils.js               ← shared backend utilities
│
├── src/                       ← React SPA (TypeScript)
│   ├── main.tsx               ← ReactDOM entry, BrowserRouter
│   ├── App.tsx                ← top-level routes + context provider nesting
│   ├── index.css              ← global styles
│   ├── vite-env.d.ts
│   ├── components/            ← reusable UI components
│   │   ├── ExpenseTable.tsx   ← expense card list; tap/click to expand full details inline
│   │   ├── Layout.tsx         ← app shell: topbar + footer + page slot; Setup badge
│   │   ├── LoadingBlock.tsx   ← spinner component
│   │   ├── MtdSpendChart.tsx  ← Chart.js area chart for MTD daily spend (Home dashboard)
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
│   │   ├── AddExpensePage.tsx  ← expense form with currency conversion
│   │   ├── AuthCallbackPage.tsx ← post-OAuth redirect handler
│   │   ├── HomePage.tsx       ← spending dashboard (TODAY / MTD / YTD)
│   │   ├── LoginPage.tsx      ← sign-in screen
│   │   ├── SearchPage.tsx     ← search with category multi-select + comment filter
│   │   ├── SetupPage.tsx      ← spreadsheet URL configuration + Google Picker
│   │   └── TailPage.tsx       ← last 20 records view
│   ├── services/              ← API client layer
│   │   ├── authApi.ts         ← /api/auth/* calls
│   │   ├── currency.ts        ← manual FX rate parsing + conversion
│   │   ├── googlePicker.ts    ← Google Picker API integration
│   │   ├── googleSheets.ts    ← /api/config + /api/expenses calls
│   │   ├── http.ts            ← fetch wrappers with typed error handling
│   │   ├── localConfig.ts     ← localStorage config cache (per-email key)
│   │   └── sharingApi.ts      ← /api/sharing/* calls (owner share management + guest reset)
│   ├── types/
│   │   └── expense.ts         ← all shared types and AppError class
│   └── utils/                 ← pure utility functions
│       ├── dashboardStats.ts  ← TODAY / MTD / YTD aggregations, ISO normalizer, chart data
│       ├── date.ts            ← local date formatting + sheet date-format detection
│       ├── expenseTable.ts    ← expense card helpers: preview length, display amount, detail detection
│       ├── search.ts          ← client-side expense filtering
│       ├── spreadsheet.ts     ← header validation, row mapping, distinct values
│       ├── storage.ts         ← safe JSON localStorage helpers
│       └── validation.ts      ← expense draft validation, decimal parsing
│
└── tests/                     ← Vitest test files
    ├── dashboard-stats.test.ts
    ├── search.test.ts
    ├── server-validation.test.js
    ├── spreadsheet.test.ts
    ├── store.test.js
    └── validation.test.ts
```

---

## 4. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Front-end framework | React 18 + TypeScript | SPA, client-side routing via react-router-dom v6 |
| Build tool | Vite 7 | Dev server on port 5173, proxies `/api` to backend |
| Test runner | Vitest 4 + jsdom | `npm test` runs `vitest run` |
| Charts | chart.js + react-chartjs-2 | MTD area chart on Home dashboard (tree-shakeable, MIT) |
| Icons | lucide-react | |
| Back-end runtime | Node.js 20, Express 4 | ES modules (`"type": "module"` in package.json) |
| Session management | express-session + connect-pg-simple | PostgreSQL-backed sessions |
| Data persistence | PostgreSQL (Supabase Free) | `users`, `fx_rate_backups`, `sessions` tables — see §7 |
| Database driver | pg (node-postgres) | Connection via `DATABASE_URL` env var |
| External API | Google Sheets API v4 | All CRUD on expense data |
| Authentication | Google OAuth 2.0 (Authorization Code + PKCE) | Server-side flow |
| Google Picker | Google Picker API | For spreadsheet selection in Setup |
| Deployment | Fly.io (Docker) | Stateless app container (no persistent volume) |
| Landing page | Vanilla HTML/CSS/JS + nginx:alpine | Separate Fly.io app |
| Email | Resend (resend.com) | Transactional email for share/revoke notifications; silently skipped if `RESEND_API_KEY` absent |

### Runtime Version Baseline

- Development baseline: Node.js `20.19.0` (pinned in `.nvmrc`)
- Supported local range: `^20.19.0 || ^22.12.0`
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
- **Token refresh:** `getAuthorizedAccessToken()` in `server/index.js` transparently refreshes expired access tokens using the stored refresh token before any Google API call.
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

All API routes are defined in `server/index.js`.

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
| GET | `/api/expenses` | Yes | Load recent expense records (Phase 1). Response includes `loadPhase` (`"full"` or `"recent"`), `startRow`, `totalRows`, and `hasDateOrderIssue` (boolean — true when at least one date row is out of chronological order). When `loadPhase` is `"recent"`, the client fetches the historical remainder via `/api/expenses/history`. |
| GET | `/api/expenses/history` | Yes | Load historical records older than the recent window. Query param: `endRow` (integer, last sheet row of the historical range). Response includes `loadPhase: "full"`. |
| POST | `/api/expenses` | Yes | Add a new expense row (append or insert depending on date); returns `201` + `{ record: ExpenseRecord, insertMode: boolean }`. `insertMode: true` means the row was inserted mid-sheet at the correct chronological position. |
| PUT | `/api/expenses/:rowNumber` | Yes | Save an edited expense row. If the date change would break chronological order, the row is repositioned (insert at correct position then delete original); returns `200` + `{ record: ExpenseRecord, moveMode: boolean }`. `moveMode: true` means the row was moved — client performs a full dataset reload. |
| DELETE | `/api/expenses/last` | Yes | Delete the last expense row (with row-count conflict check) |
| GET | `/api/fx-backup` | Yes | Get the latest saved FX rate backup |
| GET | `/api/currencies/available` | Yes | Get the currency dictionary (all supported codes + max limit) |
| GET | `/api/currencies` | Yes | Get the user's active currency codes |
| PUT | `/api/currencies` | Yes | Save user's currency selection and update sheet columns |
| PATCH | `/api/config/column-visibility` | Yes (owner) | Toggle visibility of a column on the Add Expense form (`{ field, hidden }`) |
| GET | `/api/sharing` | Yes (owner) | List all users shared with this owner |
| POST | `/api/sharing` | Yes (owner) | Add a user to the share list (`{ guestEmail, accessLevel }`) |
| PATCH | `/api/sharing/:guestEmail` | Yes (owner) | Update access level for a shared user |
| DELETE | `/api/sharing/:guestEmail` | Yes (owner) | Remove a user from the share list |
| POST | `/api/sharing/guest/reset` | Yes (guest) | Guest-initiated reset: detach from shared setup and clear to re-run Setup |

"Auth = Yes" means the `requireAuthenticatedUser` middleware is applied: it verifies the session cookie has a `userEmail`, retrieves the user record, resolves any shared setup reference (populating `req.configRecord`, `req.isGuest`, `req.accessLevel`), and attaches them to the request. "owner" routes additionally require `requireOwner` (403 for guests). Write expense routes additionally require `requireEditAccess` (403 for view-level guests).

---

## 7. Data Model & Storage

### 7.1 PostgreSQL Database (Supabase Free)

The backend uses **PostgreSQL** (hosted on Supabase Free tier) for all server-side state. Schema scripts live in `db/`. The connection is managed via `server/db.js` using `pg.Pool` configured from the `DATABASE_URL` environment variable.

#### a) `users` Table

Stores authenticated user records: OAuth tokens, spreadsheet configuration, and activity timestamps.

| Column | Type | Constraints |
|---|---|---|
| `email` | TEXT | PRIMARY KEY |
| `access_token` | TEXT | NOT NULL |
| `access_token_expires_at` | BIGINT | NOT NULL |
| `refresh_token` | TEXT | |
| `spreadsheet_url` | TEXT | |
| `spreadsheet_id` | TEXT | |
| `last_authenticated_at` | BIGINT | NOT NULL |
| `last_activity_at` | BIGINT | NOT NULL |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() |

- `email` is the natural primary key — used across sessions, API calls, and store lookups.
- Token-related BIGINT fields store epoch milliseconds (matching `Date.now()` in JavaScript).
- `created_at`/`updated_at` use TIMESTAMPTZ for operational observability.

#### b) `fx_rate_backups` Table

Stores FX rate conversion rates from expense submissions. One row per currency per submission (normalized from the previous JSONB approach). Used to pre-fill FX rates on the Add Expense form.

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `user_email` | TEXT | NOT NULL, FK → users(email) |
| `spreadsheet_id` | TEXT | |
| `expense_date` | DATE | NOT NULL |
| `currency_code` | VARCHAR(3) | NOT NULL, CHECK length = 3 |
| `fx_rate` | NUMERIC(12,6) | NOT NULL |
| `submitted_at` | TIMESTAMPTZ | NOT NULL |

- Index on `(user_email, spreadsheet_id, submitted_at DESC)` for efficient latest-backup lookup.
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
| `user_email` | TEXT | NOT NULL, FK → users(email) |
| `currency_code` | VARCHAR(3) | NOT NULL |
| `added_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `removed_at` | TIMESTAMPTZ | NULL |

- Unique partial index on `(user_email, currency_code) WHERE removed_at IS NULL` prevents duplicates among active currencies.
- When a user removes a currency, `removed_at` is set (soft-delete). The column remains in the spreadsheet for historical data.
- On first load, if no records exist for a user, active currencies are auto-seeded from the sheet's existing header columns (legacy migration).

#### e) `user_column_visibility` Table

Stores per-user, per-spreadsheet column visibility preferences for the Add Expense form. A row's presence means the column is hidden; absence means visible.

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `user_email` | TEXT | NOT NULL, FK → users(email) |
| `spreadsheet_id` | TEXT | NOT NULL |
| `canonical_field_name` | VARCHAR(30) | NOT NULL |
| `hidden_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

- Unique index on `(user_email, spreadsheet_id, canonical_field_name)` prevents duplicate entries.
- Keyed by canonical QE field name (e.g. `"Comment"`, `"PLN"`) so column renames via the Setup UI automatically migrate the preference via `renameVisibilityEntry()`.
- Only hideable columns may be toggled: `Date`, `USD`, `Category`, and `Spent By` are never hidden (rejected at the API layer).
- Tail and Search always show all columns regardless of visibility preferences.

#### f) `setup_shares` Table

Stores sharing relationships between an owner user and their invited guests.

| Column | Type | Constraints |
|---|---|---|
| `id` | SERIAL | PRIMARY KEY |
| `owner_email` | TEXT | NOT NULL, FK → users(email) ON DELETE CASCADE |
| `guest_email` | TEXT | NOT NULL |
| `access_level` | VARCHAR(4) | NOT NULL, CHECK IN ('view','edit') |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| | | UNIQUE (owner_email, guest_email) |

- `guest_email` has no FK — an invited user may not have signed in yet.
- `ON DELETE CASCADE` on `owner_email` means all guest references are automatically removed when an owner is deleted.
- Index on `(guest_email)` for efficient per-request guest resolution.
- Access levels: `edit` — full read/write; `view` — read-only (Tail, Search allowed; Add/Edit/Delete blocked at API and UI level).

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
- Header validation occurs on Setup and before every Add, Tail, and Search operation.
- Append uses Google Sheets API `values:append` with `INSERT_ROWS`.
- Load reads a dynamic column range `Expenses!A:{lastColumn}`, maps rows to `ExpenseRecord` objects with a `currencyAmounts` map.
- Dataset payload size is capped at **10 MB** (calculated as JSON byte size of all records). If exceeded, Tail/Search is denied.

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

Schema scripts are stored in `db/` as numbered SQL files (`001_initial_schema.sql`, etc.). Apply them in order against the target PostgreSQL instance. See `db/database.md` for setup instructions.

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
  - `loadDataset()` — fetches from `/api/expenses` unless a valid cached snapshot exists. Called on Home page mount (when status is `idle`) as well as by Tail/Search pages. Concurrent callers join the in-flight Promise instead of starting a duplicate request. A generation counter ensures stale Phase-2 results are discarded if a reload was triggered in the meantime.
  - Two-phase progressive load: Phase 1 (blocking) fetches the configurable recent window and sets `status = "ready"` — the UI becomes interactive. If the server returns `loadPhase: "recent"`, Phase 2 immediately fires a background call to `/api/expenses/history` to retrieve older records and merges them into the snapshot when complete. Phase 2 failures are silently swallowed (recent window remains available).
  - `isLoadingHistory` — boolean exposed in context; `true` while the Phase-2 background fetch is in progress. The Search page displays a non-blocking info banner while this is `true`.
  - `invalidateDataset()` — marks the snapshot stale, forcing a full reload on the next Tail/Search/Home visit. Reserved for error-recovery and future external-change detection scenarios.
  - `reloadDataset()` — explicit Reload button action, force-fetches regardless of cache.
  - `appendToDataset(record)` — called after a successful Add in append mode; appends the returned `ExpenseRecord` to the in-memory array and recomputes `distinctValues`. No full reload.
  - After a successful Add in insert mode (`insertMode: true` from the API), a full `reloadDataset()` is triggered instead of a surgical append — row numbers for shifted rows would otherwise be stale.
  - `updateInDataset(record)` — called after a successful Edit; replaces the matching record (by `rowNumber`) and recomputes `distinctValues`. No full reload.
  - `removeLastFromDataset()` — called after a successful Delete (last row); removes the last entry from the in-memory array and recomputes `distinctValues`. No full reload.
  - All three mutation methods are no-ops when the snapshot has not yet been loaded.
  - `DatasetSnapshot.hasDateOrderIssue` — boolean set on every load by scanning the date column. When `true`, `Layout.tsx` renders a persistent red banner on all screens prompting the user to sort their sheet. The banner disappears automatically on the next clean reload.
  - Shared between Tail and Search pages (they reuse the same in-memory dataset).
  - Holds `searchFilters` state so Search page filter values persist across navigation.

### 8.2 Routing

| Path | Component | Protected | Description |
|---|---|---|---|
| `/` | `LoginPage` | No | Sign-in screen (redirects to `/home` if already authenticated) |
| `/auth/callback` | `AuthCallbackPage` | No | Post-OAuth redirect (immediately navigates to `/home`) |
| `/home` | `HomePage` | Yes | Spending dashboard (TODAY / MTD / YTD metric cards + mini chart) |
| `/setup` | `SetupPage` | Yes | Spreadsheet configuration + Google Picker |
| `/add` | `AddExpensePage` | Yes | New expense form |
| `/tail` | `TailPage` | Yes | Last 20 records |
| `/search` | `SearchPage` | Yes | Category/comment search |

`ProtectedRoute` wraps all "Yes" routes — redirects to `/` if `auth.session` is null.

### 8.3 Service Layer

Frontend services in `src/services/` are thin wrappers around `fetch`:

- **`http.ts`** — `requestJson<T>()` and `requestNoContent()`: attach credentials, `X-Requested-With` header, parse errors into typed `AppError`.
- **`authApi.ts`** — session check, login redirect, logout.
- **`googleSheets.ts`** — config CRUD, expense load/append, FX rate backup, column visibility toggle.
- **`googlePicker.ts`** — loads Google Picker script, opens file picker dialog.
- **`currency.ts`** — manual FX rate parsing and USD conversion logic.
- **`localConfig.ts`** — per-email localStorage cache for spreadsheet config (fallback/optimization).
- **`sharingApi.ts`** — `/api/sharing/*` calls: list/add/update/remove shared users (owner); guest reset.

### 8.4 Key Front-End Conventions

- **TypeScript strict mode** with `moduleResolution: Bundler`.
- Types are centralized in `src/types/expense.ts` — includes `ExpenseDraft`, `ExpenseRecord`, `SpreadsheetConfig`, `CurrencyDictionary`, `AuthSession`, `SearchFilters`, `DatasetSnapshot`, `AppError`.
- Constants (fixed header names, `buildExpenseHeaders()`, limits) are in `src/constants/expenses.ts`.
- Pure utility functions are in `src/utils/` — validation, search filtering, spreadsheet helpers, date formatting.
- No CSS framework — global styles in `src/index.css`.
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
| `npm run dev` | Starts backend (`node server/index.js`) and Vite dev server concurrently |
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

The backend validates all required env vars at startup and fails fast if any are missing. `EXPENSE_RECENT_MONTHS`, `RESEND_API_KEY`, and `EMAIL_FROM` are optional; missing values generate a startup warning but do not fail the process.

---

## 11. Deployment

### Main App (`q-expense-app`)

- **Dockerfile:** Multi-stage: install all deps → `npm run build` → prune to production deps → run `node server/index.js`.
- **Fly.io config (`fly.toml`):**
  - Region: `fra` (Frankfurt)
  - No persistent volume — all state is in the PostgreSQL database (Supabase).
  - Single shared-cpu-1x VM (256 MB), always running (`auto_stop_machines = off`, `min_machines_running = 1`).
  - Forces HTTPS.
  - `NODE_ENV=production`, `PORT=3001`.
  - `DATABASE_URL` set as a Fly.io secret.

### Landing Page (`q-expense-landing`)

- **Dockerfile:** Copies `index.html` and `lang/` into nginx default content directory.
- **Fly.io config:** Region `fra`, auto-stop on idle (zero cost when no traffic), no persistent storage needed.

---

## 12. Key Design Decisions & Constraints (v1)

1. **PostgreSQL via Supabase Free** — user records, FX rate backups, and sessions are stored in a managed PostgreSQL database. The app container is stateless.
2. **Expense data in Google Sheets only** — the app is a thin client over Google Sheets API. No expense data is cached or stored server-side.
3. **Client-side search** — the full dataset is loaded into the browser. Capped at 10 MB JSON payload.
4. **Edit of existing records** — supported via `PUT /api/expenses/:rowNumber`. Returns `{ record, moveMode }`. When the date change keeps the row in chronological order, an in-place cell update is performed (`moveMode: false`). When the date change would break order, `moveExpenseRow` calls the existing `addExpenseRow` (insert/append decision fully reused), then deletes the original row (`moveMode: true`). The client performs a full dataset reload on `moveMode: true`, identical to the add insert-mode flow. Delete is scoped to the **last row only**, available from Tail view. Protected by a row-count conflict check: the client passes the expected row count; the backend rejects with HTTP 409 if the sheet was updated concurrently.
5. **No duplicate detection** — each Save appends a new row unconditionally.
6. **Currency:** Users configure up to 3 non-USD currencies from a dictionary of 25 (stored in `config/currencies.json` and `user_currencies` DB table). At most one non-USD currency at a time per expense, optionally alongside USD. Manual FX rate conversion (no external API). Archived currency columns remain in the sheet.
7. **No pagination** — search results capped at 100.
8. **Single sheet named "Expenses"** — no multi-sheet support.
9. **Concurrency** — relies on Google Sheets API atomic append; no manual row indexing.
10. **Session duration** — cookie lasts 30 days; business rule targets 24-hour re-auth, enforced by token expiry + refresh.
11. **No auto-creation of Config sheet** — the Config sheet is created only when the user explicitly saves a column mapping via `POST /api/config/mapping`. It is never auto-created during setup or validation flows.
12. **Explicit consent gate for column mapping** — `POST /api/config/mapping` requires `confirmed: true` in the request body. This prevents accidental overwrites of existing Config sheet data from programmatic or double-submit scenarios.
13. **Two-path setup model** — users choose between (a) creating a fresh spreadsheet from a template (default mode, no Config sheet) or (b) connecting an existing spreadsheet and optionally configuring a column mapping (config-driven mode). This design separates simple onboarding from advanced customization.
14. **Home screen is a spending dashboard** — when a user is authenticated and has expense data, `/home` renders three metric cards: TODAY (today's entries + dual-currency display), JUNE SO FAR (MTD total + YoY deviation + mini area chart), and YEAR SO FAR (YTD total + YoY deviation). Dashboard data comes from `DatasetContext.loadDataset()` — no extra API call; in-memory cache is reused if valid. All aggregations cover all rows (all `WhoSpent` values). Implemented in `src/utils/dashboardStats.ts` and `src/components/MtdSpendChart.tsx`.
15. **Setup status badge** — `Layout.tsx` overlays a green ✓ (`CheckCircle`) or red ⚠ (`AlertCircle`) badge on the Setup gear icon in the global bottom nav. Badge is computed from `ConfigContext.config.configMode`: green = sheet connected and valid; red = no sheet, or `configMode === 'config-invalid'`.
17. **Two-phase progressive dataset load** — `GET /api/expenses` performs a date-column binary search (`findExpenseStartRow`) to determine whether the sheet has enough historical rows (≥ 20) to justify splitting. When a split is warranted, only records within the last `EXPENSE_RECENT_MONTHS` months (default: 24) are returned in Phase 1. The client's `DatasetContext` immediately presents this data to the user, then fetches the remainder via `GET /api/expenses/history?endRow=N` in the background. `DatasetSnapshot.loadPhase` (`"recent"` | `"full"`) tracks completion. The `detectConfigSheet` → `validateSpreadsheet` call chain now passes the already-fetched metadata object to eliminate a duplicate `getMetadata` round-trip per load.

16. **USD is mandatory when a non-USD amount is provided** — at submission time, if any non-USD currency amount is entered but USD is empty (and no FX rate is provided to auto-derive it), the Add Expense form shows a single combined error on the FX rate field: "USD amount is required — enter an exchange rate here or fill the USD field directly." The backend enforces the same rule independently via `validateUsdMandatory()` in `server/validation.js` (HTTP 400 on `POST /api/expenses` and `PUT /api/expenses/:rowNumber`).

18. **Setup sharing model** — an owner user can share their full configuration (spreadsheet, currencies, column visibility) with any number of Google users via `POST /api/sharing`. Guests store a DB reference to the owner record — no data is duplicated. Guests with `edit` access have full read/write; `view` guests can use Tail and Search but all write actions are blocked at both API (HTTP 403) and UI levels. Guests cannot modify Setup settings. `requireAuthenticatedUser` resolves the shared reference transparently on every authenticated request. Guests whose owner config becomes invalid (owner deleted, spreadsheet removed) are shown a blocking `SharedConfigInvalidModal` prompting them to reset and set up independently.

20. **Append vs. insert mode for new expenses** — `POST /api/expenses` reads the full date column before writing. If the submitted date is ≥ the last row's date (or the sheet has no data, unrecognisable date format, or out-of-order dates), the existing `appendExpenseRow` path is used unchanged. If the submitted date is earlier than the last row's date on a well-ordered sheet, `addExpenseRow` inserts the new row at the correct chronological position using Google Sheets API `batchUpdate insertDimension` followed by `values.update`. The client performs a full dataset reload after an insert-mode write. The shared `alignValuesToHeaders()` helper is used by both append and insert paths to handle legacy column ordering and column mapping.

21. **Row repositioning on edit** — `PUT /api/expenses/:rowNumber` delegates to `moveExpenseRow` in `server/google-sheets.js`. The function reads the date column, checks if the new date keeps the row between its immediate neighbors, and falls back to `updateExpenseRow` (in-place) if so. When repositioning is required, `addExpenseRow` is called (reusing 100% of the insert/append decision logic), then the original row is deleted via `deleteDimension`. Insert-before-delete guarantees no data loss on partial failure. The client triggers the same `isInsertingHistorical` overlay and `reloadDataset()` call as the add insert-mode flow when `moveMode: true` is returned.

 — share and revoke events dispatch a transactional email via Resend after the HTTP response is returned. Delivery failure is logged server-side and never surfaced to the UI. Templates live in `server/email-templates.js` (no external template storage). Sending is silently skipped if `RESEND_API_KEY` is absent, so the feature degrades gracefully in environments without email configuration.
