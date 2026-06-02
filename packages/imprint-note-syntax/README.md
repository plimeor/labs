# @plimeor/imprint-note-syntax

Imprint note/Markdown content-layer styles — links, wikilinks, callouts, code, math, tables, tasklists, tags, mentions, and more.

## Install

```sh
bun add @plimeor/imprint-note-syntax @plimeor/imprint-tokens
```

## Usage

Import the stylesheet wherever you load your global CSS:

```js
import "@plimeor/imprint-tokens/tokens.css";
import "@plimeor/imprint-note-syntax/note-syntax.css";
```

Or via plain CSS:

```css
@import "@plimeor/imprint-tokens/tokens.css";
@import "@plimeor/imprint-note-syntax/note-syntax.css";
```

> **IMPORTANT:** This package only ships the note/Markdown content-layer styles. The CSS references design-token variables (e.g. `--color-*`, spacing, typography) defined by `@plimeor/imprint-tokens`. You **must** also load `@plimeor/imprint-tokens/tokens.css` (before this stylesheet) or the styles will resolve against missing custom properties and render incorrectly.
