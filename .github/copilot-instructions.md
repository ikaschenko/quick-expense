# Quick Expense — Project Instructions

## Who I Am & Project Stage

- **Solo builder.** No team — I own product, design, code, shipping, and promotion. Ship velocity matters.
- **Stage:** live for personal/family use; next milestone is a public launch (ProductHunt / TinyProduct).
- **AI is the primary dev force and the only QA.** I test happy paths manually; AI must proactively cover edge cases, regression, and boundaries without being asked.

## Project Overview

Quick Expense is a React 18 + Vite SPA with an Express 4 backend for recording personal/family expenses via Google Sheets. Frontend is TypeScript (`app-web/`), backend is plain JS with ES modules (`app-server/`). See [architecture.md](../architecture.md) for the full system design, data model, and technology stack.

## Quick Commands

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev (client + server) | `npm run dev` |
| Build (TS compile + Vite) | `npm run build` |
| Unit tests (Vitest) | `npm test` |
| Integration tests | `npm run test:integration` |
| Security audit | `npm run security:audit` |

Run `npm run build` after TypeScript changes and `npm test` after any logic change — both must pass before a task is complete.

## Dev Environment

- Copy `.env.example` → `.env` and fill in Google OAuth credentials — see [README.md](../README.md) for details.
- PostgreSQL is required — see [database.md](../app-server/db/database.md) for local setup (native or Docker).
- Vite dev server runs on `:5173` and proxies `/api` to the Express backend on `:3001`.
- Node.js `22.12.0` (pinned in `.nvmrc`). Supported range: `^22.12.0`.

## Core Engineering Principles

- **Root cause, not symptom.** If a fix feels like a workaround, dig deeper.
- **Domain-driven.** Model the domain first (entities/relationships) before store, API, or UI. Name things after domain concepts.
- **SOLID / low coupling, high cohesion.** One reason to change per module; extend via composition; contexts own state, services own API calls, utils are pure; frontend and backend communicate only via `/api` — never import across the boundary.
- **Do more with less.** Less code is the quality metric — prefer the simplest correct solution. Reuse existing utils/helpers before writing new (zero duplication); suggest tactical refactorings with LOC impact when they reduce net code. Prefer proven libraries over hand-rolled code, but get human approval before adding any dependency.
- **Maintainability first.** Every change leaves the codebase equal or better — no dead code, orphaned files, or commented-out blocks. Flag rot; don't ignore it.
- **Ask before deciding.** On architectural choices, trade-offs, or ambiguity, ask with options + a recommendation.

## Behavioral Guidelines

- **Resolve open questions before generating output.** If planning a deliverable surfaces open questions, ask them all first — never produce content against unresolved assumptions.
- **Think before coding.** State assumptions explicitly. If multiple interpretations exist, surface them — don't pick silently. If a simpler approach exists, say so.
- **Goal-driven execution.** Turn tasks into verifiable goals ("fix the bug" → "write a failing test that reproduces it, then make it pass"). For multi-step work, state a brief plan with a verify step per step.
- **Surgical changes.** Touch only what the task requires; match existing style; remove imports/vars your change orphaned; don't touch pre-existing dead code unless asked. Exception: apply deduplication that reduces net code (LOC impact noted) after approval.
- **Be concise.** Short bullets and brief rationale — no verbose prose or restating the obvious.

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

