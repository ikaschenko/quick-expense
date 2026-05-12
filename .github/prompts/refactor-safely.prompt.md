---
description: "Refactor code safely: snapshot test results before changes, apply refactoring, re-run tests, and verify no regressions."
mode: agent
---

## Parameters

- **REFACTORING_GOAL**: `{{REFACTORING_GOAL}}` — what to refactor and why (e.g. "extract date formatting logic from AddExpensePage into src/utils/date.ts")

---

## Task

Refactor code in the Quick Expense project with verified correctness — tests must pass before AND after the change.

---

## Step 1 — Snapshot current test state

Run `npm test` and record the result. If any tests fail **before** your changes, stop and report the failures — do not proceed with refactoring on a red test suite.

---

## Step 2 — Understand the code

Read all files involved in `{{REFACTORING_GOAL}}`. Identify:
- Which functions/modules will change.
- Which tests cover the affected code.
- Whether new tests are needed for currently-untested code paths being moved or split.

---

## Step 3 — Add missing test coverage (if needed)

If the code being refactored lacks tests, write them **before** changing the production code. This ensures the refactored version is verified against the same expectations. Run `npm test` to confirm the new tests pass.

---

## Step 4 — Apply the refactoring

Make the structural changes described in `{{REFACTORING_GOAL}}`.

Rules:
- Follow all conventions in `.github/copilot-instructions.md`.
- Remove imports/variables/functions that your changes made unused.
- Do not change behavior — only structure. If behavior changes are needed, flag them and get confirmation first.

---

## Step 5 — Verify

1. Run `npm run build` — compilation must succeed.
2. Run `npm test` — all tests must pass, including any added in Step 3.
3. If either fails, fix the issue before proceeding.

---

## Step 6 — Summary

Report:
- Files changed (with a one-line description of each change).
- Test results: before vs. after (both must be green).
- Any behavioral differences detected (there should be none).
