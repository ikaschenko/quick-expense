# Quick Expense — Project Instructions

## Who I Am & Project Stage

- **Solo builder.** No team — I own product, design, code, shipping, and promotion. Ship velocity matters.
- **Stage:** live for personal/family use; next milestone is a public launch (ProductHunt / TinyProduct).
- **AI is the primary dev force and the only QA.** I test happy paths manually; AI must proactively cover edge cases, regression, and boundaries without being asked.

## Project Overview

Quick Expense is a React 18 + Vite SPA with an Express 4 backend for recording personal/family expenses via Google Sheets. Frontend is TypeScript (`app-web/`), backend is plain JS with ES modules (`app-server/`). See [architecture.md](../architecture.md) for the full system design, data model, and technology stack.

## Workflow Defaults

- Command reference lives in [README.md](../README.md). Common gates: `npm run build` after TypeScript changes and `npm test` after logic changes.
- For ambiguous work, ask all blocking questions first. For clear work, make the smallest verifiable change and validate it.
- Favor reuse, lower LOC, low cyclomatic complexity, and long-term readability. Ask before adding dependencies or making architectural trade-offs.
- Split complex tasks into chunks with a validation step per chunk. See [PHILOSOPHY.md](PHILOSOPHY.md) for the full AI development philosophy.

## Dev Environment

- Copy `.env.example` → `.env` and fill in Google OAuth credentials — see [README.md](../README.md) for details.
- PostgreSQL is required — see [database.md](../app-server/db/database.md) for local setup (native or Docker).
- Vite dev server runs on `:5173` and proxies `/api` to the Express backend on `:3001`.
- Node.js `22.12.0` (pinned in `.nvmrc`). Supported range: `^22.12.0`.

## Project-Specific Conventions

- Frontend API calls go through `app-web/services/http.ts` — never raw `fetch` in components.
- State: three nested context providers (Auth → Config → Dataset). No Redux/Zustand without explicit approval.
- Expense data lives in the user's Google Spreadsheet — backend never stores expense rows.
- Types in `app-web/types/expense.ts`. Constants in `app-web/constants/`.
- `app-web/utils/` must be side-effect-free and testable.
- Backend routes in `app-server/index.js`. Protected routes use `requireAuthenticatedUser`, plus `requireOwner` (config mutations) or `requireEditAccess` (expense data mutations) as required — see [server.instructions.md](instructions/server.instructions.md) for the full guard matrix.
- Setup-sharing CRUD (grant/list/update/revoke guest access) goes through `app-server/sharing.js` — never query `setup_shares` directly from routes.
- Transactional email goes through `app-server/email.js`. Sends are **fire-and-forget** (`void send(...)`, never `await`ed by callers) and are silently skipped when `RESEND_API_KEY`/`EMAIL_FROM` are not configured.
- Backend is **plain JS with ES modules** — no `.ts` files under `app-server/`.
- Mutating endpoints require `X-Requested-With: fetch` header (CSRF).
- Styling: plain CSS in `app-web/index.css` with design tokens (`--color-*`, `--space-*`, `--font-size-*`, `--radius-*`, `--shadow-*`). No CSS-in-JS or utility frameworks.
- Deployment: Fly.io via Docker. CI in `.github/workflows/` — deploys on push to `main` (excluding `landing/`).

