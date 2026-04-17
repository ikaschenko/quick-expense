---
name: analyze-requirements
description: "Use when analyzing feature requirements, finding gaps or inconsistencies in a described feature, validating acceptance criteria, questioning scope, or checking alignment with the existing architecture. Asks clarifying questions — no code edits."
---

# Analyze Requirements

## When to Use

- User describes a new feature or change request and wants gap analysis.
- Validating whether a described behavior conflicts with existing modules or architecture constraints.
- Checking if proposed API endpoints, types, or config keys overlap or conflict with existing ones.
- Reviewing acceptance criteria for completeness before implementation.

## Procedure

1. **Load context.** Read `architecture.md` (especially §12 — Key Design Decisions & Constraints) and `docs/QuickExpense_business-requirements.md` to understand current scope.
2. **Parse the requirement.** Extract:
   - Which layer(s) are involved (React component, context provider, service, backend route, Google Sheets).
   - Which data entities are affected (expenses, categories, spreadsheet config, user settings).
   - What new API endpoints, types in `src/types/expense.ts`, or constants in `src/constants/` are implied.
   - Which context provider(s) would need changes (Auth, Config, Dataset).
3. **Gap analysis.** For each extracted element, check:
   - Is the input source specified? (API endpoint, Google Sheets column, user input field)
   - Is the output defined? (UI component, API response shape, side effect)
   - Are error/edge cases covered? (network failure, missing data, auth expiry, empty spreadsheet)
   - Are there implicit assumptions about Google Sheets structure or data shape?
4. **Conflict check.** Verify the requirement does not:
   - Violate append-only design (§12.4 — no edit/delete of existing rows).
   - Assume multi-sheet support (§12.8 — single sheet named "Expenses").
   - Require cross-boundary imports (`server/` ↔ `src/`).
   - Duplicate logic already in `src/utils/` or `src/services/`.
   - Bypass `src/services/http.ts` for API calls.
   - Change context provider nesting order (Auth → Config → Dataset).
   - Introduce a new npm dependency without justification.
5. **Output.** Present findings as:
   - **Gaps:** numbered list of missing/unclear items, each with a suggested resolution.
   - **Conflicts:** items that contradict existing architecture, with references to specific modules or §12 constraints.
   - **Assumptions:** implicit assumptions detected, needing human confirmation.
   - **QUESTION:** prefix for each item requiring a decision.

## Rules

- Do NOT write or edit code. Output is analysis only.
- Always ground findings in actual module names, type definitions, and architecture section references — no abstract reasoning.
- If the requirement is clear and complete, say so briefly and move on.
