# Quick Expense — Project Instructions

## Project Overview

Quick Expense is a React 18 + Vite SPA with an Express 4 backend for recording personal/family expenses via Google Sheets. Frontend is TypeScript (`src/`), backend is plain JS with ES modules (`server/`). See `architecture.md` at the repo root for the full system design, data model, and technology stack.

## Core Engineering Principles

### Root-Cause Thinking
- Always diagnose and fix the **root cause** of a problem, not the symptom or consequence.
- If a bug manifests in the UI but originates in the data layer or API — fix it at the source.
- When a fix feels like it's "working around" the issue, stop and investigate deeper.

### Domain-Driven Design
- Start from the **logical data model** first. Understand the domain entities and their relationships before touching the database/store, API endpoints, or UI components.
- Name things after domain concepts (expenses, categories, spreadsheet config), not implementation details.

### SOLID Principles
- **Single Responsibility:** Each module, component, and function should have one reason to change.
- **Open/Closed:** Extend behavior through composition, not modification of existing working code.
- **Dependency Inversion:** Frontend services depend on abstractions (`http.ts` wrappers), not raw `fetch` calls in components.

### Low Coupling, High Cohesion
- Keep related logic together (contexts own their state, services own their API calls, utils are pure functions).
- Minimize cross-cutting dependencies. Frontend and backend communicate only via `/api` routes — never import from `server/` in `src/` or vice versa.

### KISS + Thoughtful Refactoring
- Prefer the simplest solution that solves the problem correctly.
- However, when a short-term shortcut will degrade long-term maintainability or create duplication — apply timely refactoring. Reorganize code for zero duplication and maximum reasonable reuse.
- "Do more with less" — minimize lines of code while preserving clarity. Concise code is easier to maintain.

### Maintainability First
- Every change should leave the codebase in equal or better shape than before.
- Prevent quality degradation: no dead code, no orphaned files, no commented-out blocks left behind.
- If you notice deteriorating patterns while working on a task, flag them — don't ignore rot.

### Ask Before Deciding
- If there is an architectural choice, a design trade-off, or ambiguity in requirements — **raise questions to the human** rather than guessing.
- Provide: the options considered, pros and cons of each, and your recommendation. Let the human decide.

## Project-Specific Conventions

- All API calls from the frontend go through `src/services/http.ts` — never use raw `fetch` in components.
- React state is managed via three nested context providers (Auth → Config → Dataset in `App.tsx`). Do not introduce Redux, Zustand, or other state libraries without explicit agreement.
- Expense data lives in the user's Google Spreadsheet — the backend never stores expense rows.
- Types are centralized in `src/types/expense.ts`. Constants in `src/constants/`.
- Pure utility functions go in `src/utils/` — they must remain side-effect-free and testable.
- Backend routes are all in `server/index.js`. Protected routes use `requireAuthenticatedUser` middleware.
- Mutating API endpoints require the `X-Requested-With: fetch` header (CSRF protection).
- Run `npm test` (Vitest) before considering any change complete. Tests live in `tests/`.
- Run `npm run build` after TypeScript changes to verify compilation.
