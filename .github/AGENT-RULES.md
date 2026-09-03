# Quick Expense - Agent Rules

Use these boundaries for custom agents and orchestrated subagents.

## Shared Rules

- Follow `.github/copilot-instructions.md` and any matching `.github/instructions/*.instructions.md` files.
- Ask the human before adding dependencies, changing architecture, expanding OAuth scopes, or changing provider order.
- Keep outputs compact and artifact-shaped when an orchestrator depends on them.
- Do not rely on prior chat history when a handoff block, issue, diff, or plan is provided as the source of truth.

## Write Boundaries

- Product Owner: requirements only; write `docs/QuickExpense_business-requirements.md` only when explicitly asked.
- Architect: design and architecture docs only; write `architecture.md`, `app-server/db/database.md`, or `README.md` only after approved decisions.
- Developer: production code and tests; in orchestrated mode, do not update BRD/SDD docs, only list doc needs.
- Code Reviewer: read-only diff review; never implement, edit tests, or run the full test suite.
- Tester: tests and verification only; do not modify production code.
- Project Inspector: findings report only; write `docs/audit-report-YYYYMMDD.md`, not source/config changes.
