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
├── config/                    ← runtime data directory (mounted as persistent volume in prod)
│   ├── runtime-data.json      ← user records store (see §7 Data Model)
│   └── sessions/              ← express-session file-based session data (.sess files)
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
├── server/                    ← Express back-end (plain JS, ES modules)
│   ├── index.js               ← app entry: routes, middleware, session setup
│   ├── google-client.js       ← Google OAuth helpers (PKCE, token exchange, refresh)
│   ├── google-sheets.js       ← Google Sheets API operations (validate, load, append)
│   ├── session-store.js       ← Resilient file-based session store with retry logic
│   └── store.js               ← JSON-file-based user record persistence
│
├── src/                       ← React SPA (TypeScript)
│   ├── main.tsx               ← ReactDOM entry, BrowserRouter
│   ├── App.tsx                ← top-level routes + context provider nesting
│   ├── index.css              ← global styles
│   ├── vite-env.d.ts
│   ├── components/            ← reusable UI components
│   │   ├── ExpenseTable.tsx   ← table rendering with comment tooltip
│   │   ├── Layout.tsx         ← app shell: topbar + footer + page slot
│   │   ├── LoadingBlock.tsx   ← spinner component
│   │   ├── ProtectedRoute.tsx ← redirect to login if unauthenticated
│   │   └── StatusBanner.tsx   ← error/success/info banner
│   ├── constants/
│   │   ├── expenses.ts        ← header names, currency lists, limits
│   │   └── feedback.ts        ← Google Forms feedback URL
│   ├── contexts/              ← React context providers (global state)
│   │   ├── AuthContext.tsx     ← authentication state + sign-in/sign-out
│   │   ├── ConfigContext.tsx   ← spreadsheet config state
│   │   └── DatasetContext.tsx  ← expense dataset loading, caching, invalidation
│   ├── pages/                 ← route-level page components
│   │   ├── AddExpensePage.tsx  ← expense form with currency conversion
│   │   ├── AuthCallbackPage.tsx ← post-OAuth redirect handler
│   │   ├── HomePage.tsx       ← main menu (Setup / Add / Tail / Search)
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
│   │   └── localConfig.ts     ← localStorage config cache (per-email key)
│   ├── types/
│   │   └── expense.ts         ← all shared types and AppError class
│   └── utils/                 ← pure utility functions
│       ├── date.ts            ← local date formatting
│       ├── search.ts          ← client-side expense filtering
│       ├── spreadsheet.ts     ← header validation, row mapping, distinct values
│       ├── storage.ts         ← safe JSON localStorage helpers
│       └── validation.ts      ← expense draft validation, decimal parsing
│
└── tests/                     ← Vitest test files
    ├── search.test.ts
    ├── session-store.test.js
    ├── spreadsheet.test.ts
    └── validation.test.ts
```

---

## 4. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Front-end framework | React 18 + TypeScript | SPA, client-side routing via react-router-dom v6 |
| Build tool | Vite 7 | Dev server on port 5173, proxies `/api` to backend |
| Test runner | Vitest 4 + jsdom | `npm test` runs `vitest run` |
| Icons | lucide-react | |
| Back-end runtime | Node.js 20, Express 4 | ES modules (`"type": "module"` in package.json) |
| Session management | express-session + session-file-store | File-based sessions in `config/sessions/` |
| Data persistence | JSON file (`config/runtime-data.json`) | NOT a database — see §7 |
| External API | Google Sheets API v4 | All CRUD on expense data |
| Authentication | Google OAuth 2.0 (Authorization Code + PKCE) | Server-side flow |
| Google Picker | Google Picker API | For spreadsheet selection in Setup |
| Deployment | Fly.io (Docker) | Persistent volume for `config/` |
| Landing page | Vanilla HTML/CSS/JS + nginx:alpine | Separate Fly.io app |

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
  │  (stores tokens in runtime-data.json,                         │
  │   sets session.userEmail)          │                          │
  │  302 Redirect to /home             │                          │
  │◀───────────────────────────────────│                          │
```

### 5.2 Key Security Details

- **PKCE (S256):** Code verifier stored in server session, never exposed to the browser.
- **Tokens never sent to the browser:** Access tokens and refresh tokens are stored server-side in `runtime-data.json`. The browser receives only an `httpOnly` session cookie.
- **CSRF protection:** All mutating requests require an `X-Requested-With: fetch` header, checked by middleware.
- **Token refresh:** `getAuthorizedAccessToken()` in `server/index.js` transparently refreshes expired access tokens using the stored refresh token before any Google API call.
- **Session cookie:** `httpOnly`, `sameSite: lax`, `secure` when HTTPS, 30-day expiry.

### 5.3 OAuth Scopes Requested

- `openid` — user identification
- `email` — retrieve user email
- `https://www.googleapis.com/auth/drive.file` — access files created/opened by the app
- `https://www.googleapis.com/auth/drive.readonly` — read list of files (for Google Picker)

### 5.4 Session Lifecycle

- `GET /api/auth/session` — front-end polls this on startup to check if a valid session exists.
- `POST /api/auth/logout` — destroys the express-session.
- Session files are stored on disk in `config/sessions/` using `ResilientFileStore`, which adds retry logic for transient filesystem errors (EPERM/EBUSY on Windows).

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
| GET | `/api/expenses` | Yes | Load all expense records from the spreadsheet |
| POST | `/api/expenses` | Yes | Append a new expense row |
| GET | `/api/fx-backup` | Yes | Get the latest saved FX rate backup |

"Auth = Yes" means the `requireAuthenticatedUser` middleware is applied: it verifies the session cookie has a `userEmail`, retrieves the user record, and attaches it to `req.userRecord`.

---

## 7. Data Model & Storage

### 7.1 There Is No Database

The backend uses **two categories of file-based storage**, both inside the `config/` directory:

#### a) User Records — `config/runtime-data.json`

A single JSON file managed by `server/store.js`. Structure:

```json
{
  "users": {
    "user@gmail.com": {
      "email": "user@gmail.com",
      "accessToken": "ya29.…",
      "accessTokenExpiresAt": 1774356152459,
      "refreshToken": "1//03fkd…",
      "lastAuthenticatedAt": 1774352553459,
      "lastActivityAt": 1774352553459,
      "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/…/edit",
      "spreadsheetId": "1An7oInOJ…",
      "fxRateBackups": [
        {
          "expenseDate": "2026-03-17",
          "rates": { "PLN": "3,72", "BYN": "2,93", "EUR": "1,16" },
          "amounts": { "PLN": "", "BYN": "", "EUR": "17.66", "USD": "15.22" },
          "submittedAt": "2026-03-17T12:41:32.747Z",
          "spreadsheetId": "1An7oInOJ…"
        }
      ]
    }
  }
}
```

**What is stored per user:**
- Google OAuth tokens (access + refresh) — used for Google Sheets API calls.
- Spreadsheet configuration (URL and extracted ID).
- FX rate backup history (last ≤200 entries) — so the Add form can pre-fill currency conversion rates from the most recent submission.
- Timestamps for session management.

**Read/write pattern:** Every `getUserRecord()` / `updateUserRecord()` reads and rewrites the full JSON file. This is acceptable for the expected scale (≤10 users).

#### b) Session Files — `config/sessions/*.sess`

Express session data serialized to individual `.sess` files by `session-file-store`. Managed by `ResilientFileStore` (in `server/session-store.js`) which wraps write operations with retry logic to handle transient OS-level file locking errors.

### 7.2 Expense Data — Google Spreadsheet

**Expense data is NOT stored in the backend.** It lives entirely in a Google Spreadsheet controlled by the user.

Required structure:
- Sheet name: `Expenses`
- Header row (exact order):

| Date | PLN | BYN | EUR | USD | Category | WhoSpent | ForWhom | Comment | PaymentChannel | Theme |
|---|---|---|---|---|---|---|---|---|---|---|

- Auto-created if the sheet is empty on Setup.
- Legacy column order (USD/EUR swapped) is auto-migrated.
- Header validation occurs on Setup and before every Add, Tail, and Search operation.
- Append uses Google Sheets API `values:append` with `INSERT_ROWS`.
- Load reads `Expenses!A:K`, maps rows to `ExpenseRecord` objects.
- Dataset payload size is capped at **10 MB** (calculated as JSON byte size of all records). If exceeded, Tail/Search is denied.

### 7.3 Deployment Volume

On Fly.io, the `config/` directory is backed by a **persistent volume** (defined in `fly.toml` as `[[mounts]]`). This ensures `runtime-data.json` and session files survive across deployments and restarts.

---

## 8. Front-End Architecture

### 8.1 State Management — React Context Providers

The SPA uses three nested context providers (wrapped in `App.tsx`):

```
<AuthProvider>          ← authentication state, sign-in/out methods
  <ConfigProvider>      ← spreadsheet config (loaded from backend on session init)
    <DatasetProvider>   ← expense dataset: load, cache, invalidate, search filters
      <Routes>
```

- **AuthContext:** Checks `/api/auth/session` on mount. Exposes `status` (`initializing` | `signed_out` | `signed_in`), `session` (email + timestamps), `signIn()`, `signOut()`, `refreshSession()`.
- **ConfigContext:** Fetches `/api/config` when a session is present. Exposes the `SpreadsheetConfig` object and methods to save/clear/refresh.
- **DatasetContext:** Manages the loaded expense dataset. Key behaviors:
  - `loadDataset()` — fetches from `/api/expenses` unless a valid cached snapshot exists.
  - `invalidateDataset()` — called after a successful Add, forcing the next Tail/Search to reload.
  - `reloadDataset()` — explicit Reload button action, force-fetches regardless of cache.
  - Shared between Tail and Search pages (they reuse the same in-memory dataset).
  - Holds `searchFilters` state so Search page filter values persist across navigation.

### 8.2 Routing

| Path | Component | Protected | Description |
|---|---|---|---|
| `/` | `LoginPage` | No | Sign-in screen (redirects to `/home` if already authenticated) |
| `/auth/callback` | `AuthCallbackPage` | No | Post-OAuth redirect (immediately navigates to `/home`) |
| `/home` | `HomePage` | Yes | Main menu: Setup, Add, Tail, Search |
| `/setup` | `SetupPage` | Yes | Spreadsheet configuration + Google Picker |
| `/add` | `AddExpensePage` | Yes | New expense form |
| `/tail` | `TailPage` | Yes | Last 20 records |
| `/search` | `SearchPage` | Yes | Category/comment search |

`ProtectedRoute` wraps all "Yes" routes — redirects to `/` if `auth.session` is null.

### 8.3 Service Layer

Frontend services in `src/services/` are thin wrappers around `fetch`:

- **`http.ts`** — `requestJson<T>()` and `requestNoContent()`: attach credentials, `X-Requested-With` header, parse errors into typed `AppError`.
- **`authApi.ts`** — session check, login redirect, logout.
- **`googleSheets.ts`** — config CRUD, expense load/append, FX rate backup.
- **`googlePicker.ts`** — loads Google Picker script, opens file picker dialog.
- **`currency.ts`** — manual FX rate parsing and USD conversion logic.
- **`localConfig.ts`** — per-email localStorage cache for spreadsheet config (fallback/optimization).

### 8.4 Key Front-End Conventions

- **TypeScript strict mode** with `moduleResolution: Bundler`.
- Types are centralized in `src/types/expense.ts` — includes `ExpenseDraft`, `ExpenseRecord`, `SpreadsheetConfig`, `AuthSession`, `SearchFilters`, `DatasetSnapshot`, `AppError`.
- Constants (header names, currency lists, limits) are in `src/constants/expenses.ts`.
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
| `npm test` | `vitest run` (search, validation, spreadsheet, session-store tests) |

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

The backend validates all required env vars at startup and fails fast if any are missing.

---

## 11. Deployment

### Main App (`q-expense-app`)

- **Dockerfile:** Multi-stage: install all deps → `npm run build` → prune to production deps → run `node server/index.js`.
- **Fly.io config (`fly.toml`):**
  - Region: `fra` (Frankfurt)
  - Persistent volume `app_data` mounted at `/app/config` — preserves `runtime-data.json` and session files.
  - Single shared-cpu-1x VM (256 MB), always running (`auto_stop_machines = off`, `min_machines_running = 1`).
  - Forces HTTPS.
  - `NODE_ENV=production`, `PORT=3001`.

### Landing Page (`q-expense-landing`)

- **Dockerfile:** Copies `index.html` and `lang/` into nginx default content directory.
- **Fly.io config:** Region `fra`, auto-stop on idle (zero cost when no traffic), no persistent storage needed.

---

## 12. Key Design Decisions & Constraints (v1)

1. **No database** — user records and sessions are stored as files. Acceptable for ≤10 users.
2. **Expense data in Google Sheets only** — the app is a thin client over Google Sheets API. No expense data is cached or stored server-side.
3. **Client-side search** — the full dataset is loaded into the browser. Capped at 10 MB JSON payload.
4. **No edit/delete of existing records** — append-only by design (v1).
5. **No duplicate detection** — each Save appends a new row unconditionally.
6. **Currency:** At most one of PLN/BYN/EUR at a time, optionally alongside USD. Manual FX rate conversion (no external API).
7. **No pagination** — search results capped at 100.
8. **Single sheet named "Expenses"** — no multi-sheet support.
9. **Concurrency** — relies on Google Sheets API atomic append; no manual row indexing.
10. **Session duration** — cookie lasts 30 days; business rule targets 24-hour re-auth, enforced by token expiry + refresh.
