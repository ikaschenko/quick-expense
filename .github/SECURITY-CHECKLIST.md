# Quick Expense - Security Checklist

Use this checklist for architecture, review, and pre-ship security passes.

## Application Boundaries

- Access tokens and secrets stay server-side; never expose them to browser code, logs, or error responses.
- Request only the minimum Google OAuth scopes required for the feature.
- Expense rows live in the user's Google Spreadsheet; the backend must not persist expense row data.
- Setup-sharing CRUD goes through `app-server/sharing.js`; routes must not query `setup_shares` directly.
- Mutating API endpoints require `X-Requested-With: fetch` and the correct auth guard.

## Review Checks

- Auth/access control: protected routes use `requireAuthenticatedUser`, plus `requireOwner` or `requireEditAccess` as required.
- Input validation: reject malformed, missing, or unexpected data at API boundaries.
- Injection: keep SQL parameterized and avoid dynamic query construction from user input.
- Data leakage: logs and responses must not include tokens, secrets, raw PII, or unrelated users' setup details.
- SSRF/deserialization: do not fetch arbitrary user-supplied URLs or deserialize untrusted payloads without validation.
- Dependencies: review new packages and security audit findings before release.
