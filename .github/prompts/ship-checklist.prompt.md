---
description: "Pre-release quality gate: run before pushing a finished feature to production. Verifies tests, build, security, coverage, and documentation."
mode: agent
---

## Task

Run a pre-ship quality check on the Quick Expense codebase. Work through each gate in order. Do not skip a gate. If a gate fails, fix the issue before proceeding to the next one.

---

## Gate 1 — Build

Run `npm run build`. Compilation must succeed with no errors.

- If it fails, fix the TypeScript or Vite errors and re-run.

---

## Gate 2 — Tests

Run `npm test`. All tests must pass.

- If any tests fail, fix them and re-run before continuing.
- Report: total passing, total failing.
- Then run `npm run test:integration`. All integration tests must pass.
- If any integration tests fail, fix them and re-run before continuing.
- Report: total passing, total failing.

---

## Gate 3 — Security Audit

Run `npm run security:audit`.

- If vulnerabilities are found, report each one (package, severity, description).
- Fix any high/critical severity findings. Flag moderate/low for human review.
- For source-level review, use [SECURITY-CHECKLIST.md](../SECURITY-CHECKLIST.md).

---

## Gate 4 — Coverage Spot-Check

Use @workspace to identify files changed in the current feature (check git diff or review the task context).

For each changed file:
- Does a test in `tests/` exercise the changed behavior?
- If a new exported function was added, does it cover the relevant categories in [tests.instructions.md](../instructions/tests.instructions.md)?

List: ✅ covered | ⚠️ partial | ❌ missing — for each changed file.

Write tests for any ❌ gaps before continuing.

---

## Gate 5 — Documentation

Check that documentation reflects the delivered feature:

- New or changed API endpoint → row present in `architecture.md` §6 endpoint table.
- New or changed DB table/column → updated in `architecture.md` §7.1 and `db/database.md`.
- New DB migration → appended to `architecture.md` §7.3 and `db/database.md`.
- New or changed user-facing behavior → reflected in `docs/QuickExpense_business-requirements.md`.
- New context shape or service method → updated in `architecture.md` §8.

List any stale documentation and update it.

---

## Ship Report

Output a final **Ship Report** in this format:

```
## Ship Report

✅ Tests: [N passing, 0 failing]
✅ Build: clean
✅ Security: [0 vulnerabilities | list findings]
✅ Coverage: all changed behavior tested
✅ Docs: up to date

Ready to ship. ✓
```

If any gate could not be fully resolved, replace ✅ with ⚠️ and explain what is outstanding.
