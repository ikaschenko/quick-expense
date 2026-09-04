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
   - Follow the risk categories in [tests.instructions.md](../../instructions/tests.instructions.md).
4. **Verify.** Run `npm test` — all tests must pass.

## Integration Test Procedure

1. **Identify the external system.** Google Sheets API, backend endpoints, or external services.
2. **Create test file.** `tests/<name>.integration.test.js`.
3. **Document the anchor.** Add a file header comment with:
   - The test resource (spreadsheet ID, API endpoint, fixture path).
   - A note not to delete/rename the resource.
4. **Structure tests.**
   - Load config with try/catch fallback.
   - Fail loudly with a clear error listing missing vars if credentials are missing (see `google-sheets.integration.test.js`) — do not skip silently.
   - Inline expected values as constants at the top of the file.
   - Use generous timeouts for network tests (30–120 s per test).
5. **Verify.** Run `npm run test:integration` directly — never infer configuration state from a shell env-var check.

## Test Design Checklist

For each function, use the risk categories in [tests.instructions.md](../../instructions/tests.instructions.md) as the authoritative checklist.

## Reference Patterns

Existing tests to follow as examples:
- `tests/client/validation.test.ts` — uses `describe`/`it`/`expect` with inline draft objects.
- `tests/client/search.test.ts` — tests pure search/filter functions.
- `tests/client/spreadsheet.test.ts` — tests spreadsheet utility functions.

## Rules

Follow [tests.instructions.md](../../instructions/tests.instructions.md) for Vitest conventions, risk categories, fixture style, and write boundaries.
