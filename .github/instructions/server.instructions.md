---
applyTo: "server/**"
description: "Backend conventions for Express server files (plain JavaScript, ES modules)."
---

- **Plain JavaScript only** — no TypeScript. Use ES module syntax (`import`/`export`), not CommonJS.
- All routes live in `server/index.js`. Do not create separate route files without architect approval.
- Protected routes must use `requireAuthenticatedUser` middleware.
- Mutating endpoints (POST/PUT/DELETE) must check the `X-Requested-With: fetch` header (CSRF).
- Google OAuth tokens (access/refresh) are stored server-side in the session — never expose them to the browser.
- Database access goes through `server/db.js` (pg.Pool). Use parameterized queries (`$1`, `$2`) — never string interpolation.
- User/config persistence uses `server/store.js`. Google Sheets operations use `server/google-sheets.js`.
- Validate all user-supplied input at the route handler level before passing to service functions.
- Error responses should use appropriate HTTP status codes and a `{ error: "message" }` JSON body.
