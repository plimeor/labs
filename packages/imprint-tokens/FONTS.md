# Fonts

Fonts are variable faces delivered as [Fontsource][fs] npm packages and declared
as dependencies of this package. They are bundled by the consumer's tooling
(Vite, Bun, webpack, …) — local-first, no CDN, no network at runtime. This keeps
the OFL fonts vendored without committing `.woff2` blobs into the repo.

`src/theme.css` imports them at the top (CSS requires `@import` to precede other
rules), and the generated `dist/styles.css` carries the same imports:

```css
@import "@fontsource-variable/hanken-grotesk";
@import "@fontsource-variable/hanken-grotesk/wght-italic.css";
@import "@fontsource-variable/jetbrains-mono";
@import "@fontsource-variable/literata";
@import "@fontsource-variable/literata/wght-italic.css";
```

## Families

| Role                  | Token         | Package                                | `font-family`              | Axes / styles            |
| --------------------- | ------------- | -------------------------------------- | -------------------------- | ------------------------ |
| UI chrome             | `--font-ui`   | `@fontsource-variable/hanken-grotesk`  | `Hanken Grotesk Variable`  | wght 100–900, + italic   |
| Reading / prose       | `--font-read` | `@fontsource-variable/literata`        | `Literata Variable`        | wght 200–900, + italic   |
| Code / metadata       | `--font-mono` | `@fontsource-variable/jetbrains-mono`  | `JetBrains Mono Variable`  | wght 100–800 (no italic) |

The leading family in each `--font-*` token **must** match the `font-family`
string the Fontsource `@font-face` declares (note the `" Variable"` suffix), or
the variable face never matches and the stack falls through to the system
fallbacks. The fallback chains (`ui-sans-serif`, `Georgia`, `ui-monospace`, …)
are kept as the safety net while the variable woff2 loads and for code points the
Latin subsets don't cover.

The root import of each package is the weight-axis (`wght`) build with normal
faces; the `/wght-italic.css` subpath adds italics (Hanken Grotesk and Literata
only — JetBrains Mono ships no italic, matching prior usage). The optical-size
(`opsz`) builds are intentionally not imported.

[fs]: https://fontsource.org/
