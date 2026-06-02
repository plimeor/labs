# @plimeor/imprint-tokens

Imprint design system foundations: color, type, spacing, radius, elevation and
motion design tokens as CSS custom properties, plus self-hosted fonts and brand
marks. Local-first — fonts are bundled as `.woff2`, no CDN required.

## Install

```sh
bun add @plimeor/imprint-tokens
```

## Usage

Import the token stylesheet and the self-hosted fonts once, near your app entry:

```ts
import "@plimeor/imprint-tokens/tokens.css";
import "@plimeor/imprint-tokens/fonts.css";
```

`tokens.css` defaults to the light theme. Switch themes by setting
`data-theme` on a root element:

```html
<html data-theme="light"> … </html>
<html data-theme="dark"> … </html>
```

Reference tokens via `var()` in your CSS — never hardcode a hex value, always
use the semantic tokens so themes flip correctly:

```css
.card {
  background: var(--color-raised);
  color: var(--color-body);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-2);
  font-family: var(--font-ui);
}
```

### Brand marks

SVG brand marks are exported under `./brand/*`:

```ts
import markUrl from "@plimeor/imprint-tokens/brand/imprint-mark.svg";
```

Available marks: `imprint-mark.svg`, `imprint-mark-light.svg`,
`imprint-mark-accent.svg`, `imprint-wordmark.svg`.

### Note / Markdown content styles

For note-taking and Markdown surfaces, `note-syntax.css` styles rendered
content — links, wikilinks, callouts, code, math, tables, task lists, tags,
mentions, footnotes, citations, highlights, and frontmatter. It references the
token variables, so load `tokens.css` first:

```ts
import "@plimeor/imprint-tokens/tokens.css";
import "@plimeor/imprint-tokens/note-syntax.css";
```

Classes are namespaced `ns-*` (e.g. `.ns-callout`, `.ns-codeblock`).

### Tailwind CSS v4

`theme.css` bridges the tokens into Tailwind v4 — import it after Tailwind and
you get Imprint-scaled utilities (`bg-canvas`, `text-body`, `text-accent`,
`border-border-strong`, `rounded-md`, `font-ui`, `shadow-2`, …) that flip with
`data-theme`:

```css
@import "tailwindcss";
@import "@plimeor/imprint-tokens/theme.css";   /* includes tokens.css + fonts.css */
```

No `tailwind.config.js` needed — Tailwind v4 reads the `@theme` directly. Color
and shadow utilities reference the live CSS variables (so light/dark just
works); the type/radius/easing scale is set to Imprint's values. The bare
`border` utility defaults to the Imprint hairline (`border-border-strong` for a
heavier edge).

> Components in `@plimeor/imprint-react` are pre-styled (CSS Modules + tokens)
> and need no Tailwind; `theme.css` is for your own application markup. Both
> read the same variables, so they stay consistent.

