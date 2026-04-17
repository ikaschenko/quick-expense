---
name: design-tests
description: "Use when designing test scenarios, writing unit or integration tests, analyzing test coverage gaps, identifying edge cases, or planning test data. Writes test files following Vitest conventions for this project."
---

# Design Tests

## When to Use

- Designing test cases for a new or changed function.
- Writing unit tests in `tests/` or integration tests.
- Analyzing coverage gaps after reviewing existing tests.
- Planning test fixtures or integration test resource anchors.

## Unit Test Procedure

1. **Identify the target.** Unit tests cover exported pure functions only. Check the source module's exports to see what's available.
2. **Create or update test file.** One test file per source module: `tests/<moduleName>.test.ts` (TypeScript preferred) or `tests/<moduleName>.test.js`.
3. **Structure tests.**
   - Import only the functions under test from the source module.
   - Group with `describe("<functionName>", () => { ... })`.
   - Use `it()` for individual test cases with descriptive names: `it('should reject draft when amount is negative')`.
   - Use `it.each` for tabular input/output:
     ```ts
     it.each([
       ["input1", "expected1"],
       ["input2", "expected2"],
     ])("description %s → %s", (input, expected) => {
       expect(functionUnderTest(input)).toBe(expected);
     });
     ```
   - Test null/undefined coercion paths and empty strings.
   - Test boundary values (empty arrays, zero, negative numbers, single elements).
4. **Verify.** Run `npm test` — all tests must pass.

## Integration Test Procedure

1. **Identify the external system.** Google Sheets API, backend endpoints, or external services.
2. **Create test file.** `tests/<name>.integration.test.js`.
3. **Document the anchor.** Add a file header comment with:
   - The test resource (spreadsheet ID, API endpoint, fixture path).
   - A note not to delete/rename the resource.
4. **Structure tests.**
   - Load config with try/catch fallback.
   - Skip the suite if credentials are missing.
   - Inline expected values as constants at the top of the file.
   - Use generous timeouts for network tests (30–120 s per test).
5. **Verify.** Run `npm run test:integration`.

## Test Design Checklist

For each function, verify coverage of:

| Category | Examples |
|----------|----------|
| Happy path | Normal inputs producing expected output |
| Null/empty | `null`, `undefined`, `""`, missing fields |
| Boundary | Zero-length arrays, max-length strings, single element |
| Malformed input | Invalid URLs, non-string where string expected, wrong date format |
| Return type | Correct type returned (string, array, object, number) |

## Reference Patterns

Existing tests to follow as examples:
- `tests/validation.test.ts` — uses `describe`/`it`/`expect` with inline draft objects.
- `tests/search.test.ts` — tests pure search/filter functions.
- `tests/spreadsheet.test.ts` — tests spreadsheet utility functions.

## Rules

- Use Vitest (`describe`/`it`/`expect`), not Jest. Test runner is configured in `vite.config.ts`.
- Do not mock what you can call directly. Pure functions (`src/utils/`) should be tested with real inputs.
- DO NOT modify production code in `src/` or `server/` — only test files.
- Keep test data inline and minimal — only include fields relevant to the assertion.
- Each test should test one behavior — avoid multi-assertion tests that obscure which behavior failed.
