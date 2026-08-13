---
applyTo: "app-web/**"
description: "Frontend conventions for React/TypeScript files (components, pages, contexts, services)."
---

- Access shared state via the named hooks — `useAuth()`, `useConfig()`, `useDataset()` — never import context objects directly. Don't change the Auth → Config → Dataset nesting without architect approval.
- All API calls go through `app-web/services/*.ts`, using `requestJson`/`requestNoContent` from `http.ts` — never raw `fetch` in components or pages.
- Icons come from `lucide-react` only.
- Extend shared types in `app-web/types/expense.ts` — don't redeclare shapes locally.
- `app-web/utils/` must stay pure (no API calls, no context access) — keep it unit-testable.
- Styling uses plain CSS classes/tokens from `app-web/index.css` — see [css.instructions.md](css.instructions.md).
