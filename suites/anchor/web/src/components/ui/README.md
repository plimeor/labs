# Anchor UI

Anchor's own component layer: thin wrappers over [HeroUI](https://heroui.com)
that pin a small, stable prop API for the app while delegating behavior and
styling to HeroUI's default components.

## Principles

- **Wrappers own the app-facing API.** Each file exports a narrow prop shape in
  Anchor's vocabulary (e.g. `Button` variants `primary`/`secondary`, `Dialog`
  `open`/`onOpenChange`). Callers import from `../components/ui` and never touch
  HeroUI directly, so the underlying library can change without churn.
- **HeroUI owns behavior and look.** Managed state, focus, scroll lock, and ARIA
  wiring come from HeroUI (built on react-aria). The wrappers use HeroUI's
  **default** styling — variant/size props — rather than hand-written Tailwind.
- **Theme follows the app toggle.** HeroUI v3 keys its dark theme off
  `[data-theme="dark"]` on `<html>`, which is exactly what `src/lib/theme.tsx`
  already sets, so light/dark tracks Anchor's theme switch with no extra wiring.

## Layout

- `button.tsx` — `Button` (variants: `primary`, `secondary`).
- `dialog.tsx` — `Dialog` (HeroUI `Modal`).
- `select.tsx` — `Select` (single value, HeroUI `Select` + `ListBox`).
- `slider.tsx` — `Slider` (single thumb, HeroUI `Slider`).
- `index.ts` — public barrel; import from `../components/ui`.

Add new wrappers as siblings and re-export them from `index.ts`.
