---
applyTo: "tests/**"
description: "Test conventions for Vitest test files."
---

- Use **Vitest** (`describe`/`it`/`expect`), not Jest.
- One test file per source module: `tests/<moduleName>.test.ts` (or `.test.js` for server modules).
- Group tests with `describe("<functionName>")`. Use `it()` with descriptive names: `it('should reject draft when amount is negative')`.
- Use `it.each` for tabular input/output scenarios.
- Do not mock what you can call directly — test pure functions with real inputs.
- Each test should test one behavior. Keep test data inline and minimal.
- Integration tests use `*.integration.test.js` naming and the `vitest.integration.config.ts` config.
- Cover the relevant risk categories for changed behavior:

| Category | Examples |
|----------|----------|
| Happy path | Normal inputs producing expected output |
| Null/empty | `null`, `undefined`, `""`, missing fields, empty arrays |
| Boundary | Zero, negative numbers, max-length strings, single-element arrays |
| Malformed input | Wrong types, invalid formats, bad dates, invalid URLs |
| Error paths | API failure, network error, auth expiry, permission denial |
| Return/observable contract | Correct return type, rendered state, emitted request, persisted value |

- Reference patterns: `tests/client/validation.test.ts`, `tests/client/search.test.ts`, `tests/client/spreadsheet.test.ts`, `tests/client/AddExpensePage.test.tsx`, and `tests/server/store.test.js`.
