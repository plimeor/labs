# Anchor UI

Anchor's own component layer. Anchor ships **one** robust built-in theme (light +
dark, no end-user customization), so the UI kit is owned in-repo rather than
adopted from an opinionated styled library (HeroUI was removed in favor of this).

## Principles

- **Theme tokens are the contract.** Components consume the CSS variables defined
  in `src/styles/theme/*` (surfaces, text, borders, state, accent, feedback) and
  the Tailwind utilities the bridge generates. No hard-coded colors.
- **Simple controls are styled native elements.** A button is a `<button>`, an
  input is an `<input>` — typed, token-styled, accessible by default.
- **Complex behavior wraps [Ark UI](https://ark-ui.com).** Anything with managed
  state, focus, or ARIA wiring (dialog, menu, popover, combobox, tooltip, tabs,
  select) is built on `@ark-ui/solid`'s headless primitives and styled here with
  our tokens — we own the look, Ark owns the behavior.

## Layout

- `button.tsx` — `Button` (variants: `primary`, `secondary`).
- `index.ts` — public barrel; import from `../components/ui`.

Add Ark-based components as siblings (e.g. `dialog.tsx`, `menu.tsx`) and re-export
them from `index.ts`.
