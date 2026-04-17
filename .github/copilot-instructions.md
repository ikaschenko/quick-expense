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

## Behavioral Guidelines

### Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

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
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting when editing.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

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

## Common Mistakes to Avoid

- Using raw `fetch` instead of `src/services/http.ts` in components or pages.
- Importing from `server/` in `src/` or vice versa.
- Adding state management libraries (Redux, Zustand, etc.) without explicit approval.
- Forgetting the `X-Requested-With: fetch` header on mutating API endpoints.
- Scattering type definitions instead of centralizing in `src/types/expense.ts`.
- Forgetting `requireAuthenticatedUser` middleware on new protected routes.
- Modifying context provider nesting order (Auth → Config → Dataset) without architect approval.
- Putting side effects (network, storage, DOM) in `src/utils/` — those must remain pure.
- Adding npm packages without human approval.
- Leaving dead code, commented-out blocks, or orphaned files behind after a change.
