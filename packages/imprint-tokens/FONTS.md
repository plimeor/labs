# Self-hosted fonts

Fonts are bundled locally in `src/fonts/` as `.woff2` and wired up via
`src/fonts.css`. Every `@font-face` `src: url()` points only at a local
`./fonts/<file>.woff2` — there is no CDN reference and no network dependency at
runtime. `font-display: swap` is used throughout.

Sources are [Fontsource](https://fontsource.org/) builds, fetched once from
jsDelivr:

```
https://cdn.jsdelivr.net/fontsource/fonts/<id>@latest/<file>.woff2
```

## Bundled files (9 / 9 downloaded)

| Family          | id                | Fontsource file     | Local file                          | Status |
| --------------- | ----------------- | ------------------- | ----------------------------------- | ------ |
| Hanken Grotesk  | `hanken-grotesk`  | `latin-400-normal`  | `hanken-grotesk-400-normal.woff2`   | ok     |
| Hanken Grotesk  | `hanken-grotesk`  | `latin-500-normal`  | `hanken-grotesk-500-normal.woff2`   | ok     |
| Hanken Grotesk  | `hanken-grotesk`  | `latin-600-normal`  | `hanken-grotesk-600-normal.woff2`   | ok     |
| Hanken Grotesk  | `hanken-grotesk`  | `latin-700-normal`  | `hanken-grotesk-700-normal.woff2`   | ok     |
| Hanken Grotesk  | `hanken-grotesk`  | `latin-400-italic`  | `hanken-grotesk-400-italic.woff2`   | ok     |
| JetBrains Mono  | `jetbrains-mono`  | `latin-400-normal`  | `jetbrains-mono-400-normal.woff2`   | ok     |
| JetBrains Mono  | `jetbrains-mono`  | `latin-500-normal`  | `jetbrains-mono-500-normal.woff2`   | ok     |
| JetBrains Mono  | `jetbrains-mono`  | `latin-600-normal`  | `jetbrains-mono-600-normal.woff2`   | ok     |
| Literata (var)  | `literata:vf`     | `latin-wght-normal` | `literata-wght-normal.woff2`        | ok     |
| Literata (var)  | `literata:vf`     | `latin-wght-italic` | `literata-wght-italic.woff2`        | ok     |

All 10 listed `@font-face` sources resolve to the 9 expected weight/style
variants plus the variable Literata pair, and every saved file is larger than
1 KB. Nothing is missing.

Note: the Literata variable font id contains a colon (`literata:vf`). The
jsDelivr Fontsource endpoint serves it with the literal colon in the path; the
two Literata `@font-face` rules declare `font-weight: 400 700` (variable range)
for normal and italic respectively.
