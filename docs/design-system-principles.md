# Anchor Design System Principle

Status: Current principle
Scope: `apps/anchor-web`, `packages/anchor-editor`

## Principle

Anchor's design system is a small CSS-token contract for one excellent light
theme and one excellent dark theme. CSS owns visual truth, semantic tokens own
mode changes, and every surface keeps the writing plane more legible than the
surrounding chrome.

The system is author-extensible, not user-extensible. Anchor's customization
story is the quality, completeness, and accessibility of its two curated themes.

## Responsibility Boundaries

- `apps/anchor-web/src/styles/theme/primitives.css` owns raw palette, font,
  spacing, radius, weight, line-height, and measure values.
- `apps/anchor-web/src/styles/theme/semantic.light.css` and
  `apps/anchor-web/src/styles/theme/semantic.dark.css` own role tokens and the
  complete light/dark value pairing.
- `apps/anchor-web/src/styles/theme/components.css` owns element tokens that a
  generic semantic role cannot express, or that editor/runtime code reads
  directly.
- `apps/anchor-web/src/styles/theme/bridge.css` owns Tailwind utility aliases.
  It forwards to ring tokens and never carries independent values.
- `apps/anchor-web/src/styles/theme/base.css` owns global consumers such as
  root typography, selection, focus-visible, scrollbars, and floating-surface
  depth.
- `apps/anchor-web/src/lib/theme.tsx` owns runtime theme preference,
  resolved-theme stamping, browser chrome color sync, and Tauri native chrome
  sync.

## Operating Rules

1. CSS custom properties are the source of truth for colors, spacing, radius,
   type, elevation, content styling, and editor syntax colors. JavaScript reads
   tokens or stamps the resolved mode; it does not redefine visual values.
2. The token system has four rings: primitives, semantic, component, and bridge.
   Primitives are mode-invariant and appearance-named. Semantic tokens are the
   mode-dependent contract. Component tokens exist only for element-specific
   needs. Bridge tokens are generated indirection for framework ergonomics.
3. Light and dark are paired, hand-tuned themes. Dark mode is not an inversion
   of light mode, and the semantic files remain side-by-side so role decisions
   stay diffable.
4. The editor/content plane is the visual figure. Chrome recedes through
   quieter surfaces, demoted text roles, subtle borders, and restrained accent
   use. Accent appears on active intent, focus, caret, links, selection, and
   primary action; it does not become general decoration.
5. Completeness is part of the product contract. Hover, active, focus-visible,
   disabled, selected, dragging, empty, loading, error, scrollbars, popovers,
   dialogs, markdown preview, and CodeMirror syntax surfaces all have covered
   token paths in both modes.
6. Accessibility gates belong in the design system, not in downstream
   component luck. Text and interactive boundaries use contrast-checked tokens;
   decorative hairlines and faint metadata stay explicitly decorative.
   Feedback states pair color with icon, shape, text, or another non-color cue.
7. The system uses one brand accent. Meaningful non-brand states use feedback
   roles such as success, warning, and danger. Syntax colors are separate from
   product feedback colors.
8. Component CSS and editor widgets consume semantic or component tokens. A new
   component token is justified by a value that differs from generic role
   semantics, changes independently, is reused, or is read by runtime/editor
   code.
9. Tailwind utilities expose a curated content-forward subset of the token
   contract. Utility names optimize call-site readability, while the underlying
   CSS variables keep their semantic names.
10. Runtime preference and resolved appearance stay separate. User preference
    may be `light`, `dark`, or `system`; `<html data-theme>` receives only the
    resolved `light` or `dark` value. Consumers that need exact colors read CSS
    tokens from the resolved document.
11. Floating surfaces use both surface elevation and an explicit edge. In dark
    mode the border is the primary depth cue; shadow is supplementary.
12. The design system grows by tightening the token contract first, then by
    migrating call sites. Public behavior, persistence, and editor Markdown
    fidelity are outside the design-system layer unless a separate change
    explicitly moves that boundary.
