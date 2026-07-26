---
applyTo: "app-web/**"
description: "Frontend conventions for React/TypeScript files (components, pages, contexts, services)."
---

- Access shared state via the named hooks — `useAuth()`, `useConfig()`, `useDataset()` — never import context objects directly.
- Provider nesting order is fixed: Auth → Config → Dataset. Do not change without architect approval.
- All API calls go through `app-web/services/*.ts`, using `requestJson`/`requestNoContent` from `http.ts` — never raw `fetch` in components or pages.
- Icons come from `lucide-react` only — no other icon libraries.
- Shared expense types live in `app-web/types/expense.ts` — extend there, don't redeclare shapes locally.
- Constants live in `app-web/constants/` (e.g. `expenses.ts`, `feedback.ts`).
- `app-web/utils/` must stay side-effect-free and pure (no API calls, no context access) — keep it unit-testable.
- Styling uses plain CSS classes/tokens from `app-web/index.css` — no CSS-in-JS, no inline `style={{}}` props, and no utility frameworks. Add/extend classes in `app-web/index.css` using existing design tokens (see [css.instructions.md](css.instructions.md)).
