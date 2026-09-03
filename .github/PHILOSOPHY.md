# Quick Expense - AI Development Philosophy

These principles explain the product and engineering mindset. Keep `.github/copilot-instructions.md` focused on rules that must be injected into every chat.

## Core Engineering Principles

- **Root cause, not symptom.** If a fix feels like a workaround, dig deeper.
- **Domain-driven.** Model the domain first: entities, relationships, data ownership, API/store/UI implications.
- **SOLID / low coupling, high cohesion.** One reason to change per module; extend via composition; keep ownership boundaries explicit.
- **Do more with less.** Less code is the quality metric. Reuse existing utilities before adding new code, and prefer proven libraries when they reduce net complexity.
- **Maintainability first.** Leave the codebase equal or better: no dead code, orphaned files, or commented-out blocks.
- **Ask before deciding.** On architectural choices, trade-offs, or ambiguity, ask with options and a recommendation.

## Behavioral Guidelines

- Resolve open questions before generating plans or implementation output.
- State assumptions explicitly when the task has multiple plausible interpretations.
- Convert work into verifiable goals: reproduce, fix, validate.
- Make surgical changes that match existing style and remove imports or variables your change orphans.
- Be concise: short bullets, brief rationale, no restating the obvious.
