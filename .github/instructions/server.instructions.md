---
applyTo: "server/**"
description: "Backend conventions for Express server files (plain JavaScript, ES modules)."
---

- **Plain JavaScript only** — no TypeScript. Use ES module syntax (`import`/`export`), not CommonJS.
- All routes live in `server/index.js`. Do not create separate route files without architect approval.
- Protected routes must use `requireAuthenticatedUser` middleware.
- Mutating endpoints (POST/PUT/DELETE) must check the `X-Requested-With: fetch` header (CSRF).

### Route Guards (`server/resilience.js`)

`requireAuthenticatedUser` resolves `req.isGuest` and `req.accessLevel` ("edit" for owners, share-defined for guests). Every route must chain the correct guard **after** `requireAuthenticatedUser` based on what it does:

| Route type | Guard chain | Example |
|---|---|---|
| Read-only data (expenses, config, sharing) reachable by owner or guest | `requireAuthenticatedUser` only | `GET /api/expenses` |
| Expense data mutation (create/update/delete expense rows) | `requireAuthenticatedUser, requireEditAccess` | `POST /api/expenses` |
| Setup/config mutation (spreadsheet structure, columns, currencies, sharing management) — owner only | `requireAuthenticatedUser, requireOwner` | `POST /api/sheet/column` |
| Guest-only action | `requireAuthenticatedUser, requireGuest` | `POST /api/sharing/guest/reset` |

- `requireOwner` blocks **guests entirely** — use on any route that mutates the setup/config itself (not expense rows), since guests must never alter the owner's configuration.
- `requireEditAccess` blocks **view-only guests** — use on any route that mutates expense data, allowing edit-level guests through.
- Never add a new mutating (POST/PUT/PATCH/DELETE) route without one of `requireOwner` or `requireEditAccess` unless it is guest-only (`requireGuest`) or intentionally accessible to all authenticated roles — state the reason in the PR/commit if so.
- Google OAuth tokens (access/refresh) are stored server-side in the session — never expose them to the browser.
- Database access goes through `server/db.js` (pg.Pool). Use parameterized queries (`$1`, `$2`) — never string interpolation.
- User/config persistence uses `server/store.js`. Google Sheets operations use `server/google-sheets.js`.
- Validate all user-supplied input at the route handler level before passing to service functions.
- Error responses should use appropriate HTTP status codes and a `{ error: "message" }` JSON body.
