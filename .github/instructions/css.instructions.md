---
applyTo: "src/index.css"
description: "CSS styling conventions — design tokens, plain CSS, no frameworks."
---

- All styles live in this single file — no CSS modules, CSS-in-JS, or utility frameworks (Tailwind, etc.).
- Use existing design tokens (CSS custom properties) defined in `:root`:
  - Colors: `--color-accent`, `--color-bg`, `--color-surface`, `--color-text-primary`, `--color-error`, etc.
  - Spacing: `--space-1` (4px) through `--space-10` (40px).
  - Typography: `--font-size-xs` through `--font-size-3xl`.
  - Radius: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`.
  - Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`.
- Button classes: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-inline`.
- Card classes: `.card`, `.card-hover`.
- Use BEM-like naming for component-specific classes: `.home-status-card`, `.home-status-label`.
- Mobile-first: most components are already responsive. Use media queries when needed.
