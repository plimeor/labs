# @plimeor/imprint-tokens

Imprint design system foundations: color, type, spacing, radius, elevation and
motion design tokens, authored as a **Tailwind v4 theme** and also published as a
generated **framework-agnostic stylesheet** — plus variable fonts and brand marks.

`src/theme.css` is the single source of truth (Tailwind v4 syntax). A small Bun
build (`build.ts`) compiles it to `dist/styles.css`, which is plain CSS for
non-Tailwind consumers: `@theme` becomes `:root`, Tailwind-only at-rules are
stripped, and the `@fontsource` imports are preserved.

## Install

```sh
bun add @plimeor/imprint-tokens
```

The three variable fonts ([Hanken Grotesk][hg], [Literata][li], [JetBrains
Mono][jb]) come along as dependencies via [Fontsource][fs] — local-first,
bundled by your tooling, no CDN.

## Usage

### Tailwind v4 projects

Import the theme after Tailwind. You get Imprint-scaled utilities (`bg-canvas`,
`text-body`, `text-accent`, `border-border-strong`, `rounded-md`, `font-ui`,
`shadow-2`, …) plus `dark:` / `light:` variants — all keyed to `data-theme`:

```css
@import "tailwindcss";
@import "@plimeor/imprint-tokens/theme.css";
```

No `tailwind.config.js` needed — Tailwind v4 reads the `@theme` directly. Tokens
are registered with `@theme static`, so every token is emitted into `:root`
(available to your own CSS via `var()`) and utilities reference the live
variable, so light/dark just works.

### Everything else (plain CSS, CSS Modules, Storybook, …)

Import the generated stylesheet. It defines every token as a CSS custom property
and pulls in the font faces:

```ts
import "@plimeor/imprint-tokens/styles.css";
```

### Theme switching

Tokens default to light. Switch by setting `data-theme` on a root element (a
nested island works too — `data-theme="light"` inside a dark subtree re-asserts
light):

```html
<html data-theme="light"> … </html>
<html data-theme="dark"> … </html>
```

### Referencing tokens

Reference tokens via `var()` in your CSS — never hardcode a hex value, always use
the semantic tokens so themes flip correctly:

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

> Components in `@plimeor/imprint-react` are pre-styled (CSS Modules + tokens) and
> need no Tailwind; they read the same variables, so the two stay consistent.

### Brand marks

SVG brand marks are exported under `./brand/*`:

```ts
import markUrl from "@plimeor/imprint-tokens/brand/imprint-mark.svg";
```

Available marks: `imprint-mark.svg`, `imprint-mark-light.svg`,
`imprint-mark-accent.svg`, `imprint-wordmark.svg`.

### Note / Markdown content styles

For note-taking and Markdown surfaces, `note-syntax.css` styles rendered content
— links, wikilinks, callouts, code, math, tables, task lists, tags, mentions,
footnotes, citations, highlights, and frontmatter. It only references the token
variables, so load the tokens first:

```ts
import "@plimeor/imprint-tokens/styles.css";
import "@plimeor/imprint-tokens/note-syntax.css";
```

Classes are namespaced `ns-*` (e.g. `.ns-callout`, `.ns-codeblock`).

[hg]: https://www.npmjs.com/package/@fontsource-variable/hanken-grotesk
[li]: https://www.npmjs.com/package/@fontsource-variable/literata
[jb]: https://www.npmjs.com/package/@fontsource-variable/jetbrains-mono
[fs]: https://fontsource.org/
