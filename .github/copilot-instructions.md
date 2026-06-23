# Quick Expense — Project Instructions

## Project Overview

Quick Expense is a React 18 + Vite SPA with an Express 4 backend for recording personal/family expenses via Google Sheets. Frontend is TypeScript (`src/`), backend is plain JS with ES modules (`server/`). See [architecture.md](../architecture.md) for the full system design, data model, and technology stack.

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
- PostgreSQL is required — see [db/database.md](../db/database.md) for local setup (native or Docker).
- Vite dev server runs on `:5173` and proxies `/api` to the Express backend on `:3001`.
- Node.js `20.19.0` (pinned in `.nvmrc`). Supported range: `^20.19.0 || ^22.12.0`.

## Core Engineering Principles

### Root-Cause Thinking
- Diagnose and fix the **root cause**, not the symptom. If a fix feels like a workaround, investigate deeper.

### Domain-Driven Design
- Start from the **logical data model** — understand domain entities and relationships before touching store, API, or UI.
- Name things after domain concepts, not implementation details.

### SOLID Principles
- **Single Responsibility:** One reason to change per module/component/function.
- **Open/Closed:** Extend via composition, not modification of working code.
- **Dependency Inversion:** Frontend services depend on `http.ts` abstractions, not raw `fetch`.

### Low Coupling, High Cohesion
- Keep related logic together (contexts own state, services own API calls, utils are pure).
- Frontend and backend communicate only via `/api` routes — never import across boundaries.

### Do More With Less
- **Less code is better code.** The primary metric for implementation quality is minimal lines of code added while preserving clarity and correctness.
- Prefer the simplest solution that solves the problem correctly.
- **Prefer proven libraries over hand-rolled code.** When a well-maintained package solves the problem, recommend it — the project codebase grows slower and responsibility is shared with the community. Always get human approval before adding a new dependency.
- **Zero duplication.** Before writing new code, search for existing utilities, helpers, or patterns that can be reused. Suggest tactical refactorings (with estimated LOC impact) in the implementation plan when they enable reuse or reduce net code.
- When a short-term shortcut will degrade long-term maintainability — apply timely refactoring.

### Maintainability First
- Every change must leave the codebase in equal or better shape. No dead code, orphaned files, or commented-out blocks.
- If you notice deteriorating patterns, flag them — don't ignore rot.

### Ask Before Deciding
- On architectural choices, trade-offs, or ambiguity — **ask the human** with options, pros/cons, and your recommendation.

## Behavioral Guidelines

### Questions Before Output

**Resolve all open questions before generating any content.**

- While planning any deliverable (implementation plan, user story, feature spec, code), if open questions arise — **stop and ask them all before writing any output**. Do not generate content against unresolved assumptions.
- Repeat the question loop as many times as needed until every open question is resolved, then proceed.
- Reason: avoids wasting tokens and human review time on content that may need to be discarded.

### Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs. Be concise.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- **Conciseness:** When investigating a problem or proposing a plan, use short bullet points and brief rationale — no verbose prose or restating the obvious.

### Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

### Surgical Changes

**Touch only what you must — except when deduplication reduces net code.**

- Don't "improve" adjacent code, comments, or formatting when editing.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code or duplication, mention it — don't fix it silently.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- **Exception:** When a task reveals duplication that the new code would worsen, include a refactoring step in the plan (with LOC impact). Apply only after human approval.

## Project-Specific Conventions

- Frontend API calls go through `src/services/http.ts` — never raw `fetch` in components.
- State: three nested context providers (Auth → Config → Dataset). No Redux/Zustand without explicit approval.
- Expense data lives in the user's Google Spreadsheet — backend never stores expense rows.
- Types in `src/types/expense.ts`. Constants in `src/constants/`.
- `src/utils/` must be side-effect-free and testable.
- Backend routes in `server/index.js`. Protected routes use `requireAuthenticatedUser`.
- Backend is **plain JS with ES modules** — no `.ts` files under `server/`.
- Mutating endpoints require `X-Requested-With: fetch` header (CSRF).
- Styling: plain CSS in `src/index.css` with design tokens (`--color-*`, `--space-*`, `--font-size-*`, `--radius-*`, `--shadow-*`). No CSS-in-JS or utility frameworks.
- Deployment: Fly.io via Docker. CI in `.github/workflows/` — deploys on push to `main` (excluding `landing/`).

