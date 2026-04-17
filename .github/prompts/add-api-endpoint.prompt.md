---
description: "Scaffold a new API endpoint end-to-end: backend route, frontend service call, types, and tests."
mode: agent
---

## Parameters

- **ENDPOINT_PATH**: `{{ENDPOINT_PATH}}` — e.g. `/api/expenses/summary`
- **HTTP_METHOD**: `{{HTTP_METHOD}}` — GET, POST, PUT, DELETE
- **DESCRIPTION**: `{{DESCRIPTION}}` — what the endpoint does
- **REQUIRES_AUTH**: `{{REQUIRES_AUTH}}` — yes or no

---

## Task

Add a new API endpoint to the Quick Expense application following all project conventions. Execute each step in order, verifying as you go.

---

## Step 1 — Add the backend route

In `server/index.js`, add a new route for `{{HTTP_METHOD}} {{ENDPOINT_PATH}}`.

- If `{{REQUIRES_AUTH}}` is "yes", apply the `requireAuthenticatedUser` middleware.
- If the method is POST, PUT, or DELETE (mutating), require the `X-Requested-With: fetch` header — use the existing CSRF check pattern from other mutating routes in the file.
- Follow the existing route structure and error handling patterns in `server/index.js`.

---

## Step 2 — Add or extend types

If the endpoint introduces new request or response shapes:
- Add the type definitions to `src/types/expense.ts` (the centralized types file).
- Do NOT scatter types across other files.

If the endpoint reuses existing types, skip this step.

---

## Step 3 — Add the frontend service function

Add a service function in the appropriate `src/services/*.ts` file (or create a new one if no existing file fits).

- Use the `http.ts` wrappers (`httpGet`, `httpPost`, etc.) — never raw `fetch`.
- Export the function so components/contexts can import it.

---

## Step 4 — Wire into the calling component or context

Connect the new service function to the component or context that will use it.

- If it affects shared state, wire it through the appropriate context provider (Auth, Config, or Dataset).
- If it's page-specific, call it from the relevant page component.

---

## Step 5 — Add tests

Add test coverage in `tests/`:
- Test the service function's request shape if non-trivial.
- Test any new pure utility logic introduced.
- Follow Vitest conventions: `describe()`/`it()`/`expect()`.

---

## Step 6 — Verify

1. Run `npm run build` — compilation must succeed.
2. Run `npm test` — all tests must pass.
3. If either fails, fix the issue before reporting done.

---

## Step 7 — Update architecture docs (if significant)

If this is a major new endpoint (not a trivial helper), update `architecture.md` §7 (API Endpoints) to document:
- Method, path, auth requirement, request/response shape, and purpose.
