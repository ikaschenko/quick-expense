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
- Reference patterns: `tests/validation.test.ts`, `tests/search.test.ts`, `tests/spreadsheet.test.ts`.
