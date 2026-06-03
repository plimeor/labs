#!/usr/bin/env bun
/**
 * imprint-tokens build — src/theme.css (Tailwind v4 native) → dist/styles.css (plain CSS).
 *
 * theme.css is the single source of truth, authored in Tailwind v4 syntax. This
 * transform produces a framework-agnostic stylesheet for non-Tailwind consumers
 * (CSS Modules, Storybook, plain projects):
 *
 *   @theme static { --x: … }   →   @layer theme { :root { --x: … } }   (tokens
 *                                   become real custom properties for var()
 *                                   consumers, in the SAME @layer theme as the
 *                                   dark [data-theme] block below, so dark — which
 *                                   comes later in source order — wins the swap)
 *   @utility name { … }   →   .name { … }   (typography presets become plain classes)
 *   @custom-variant / @variant / @apply / @tailwind   →   dropped
 *   @import "@fontsource-variable/*"   →   kept (the consumer's bundler resolves
 *                                          the bare specifier + woff2 urls)
 *   @layer theme { [data-theme="dark"] … } / :root / @media / @layer base / .focus-ring → passthrough
 *
 * Faithful by construction: postcss preserves source order, comments, and exact
 * declaration values (nested var(), rgba(var(--x) / a), cubic-bezier, …). No
 * minification, no asset inlining, no Tailwind preflight, no generated utilities
 * (only the @utility presets, expanded to plain .type-* classes).
 */
import { resolve } from 'node:path'

import postcss from 'postcss'

const SRC = resolve(import.meta.dir, 'src/theme.css')
const OUT = resolve(import.meta.dir, 'dist/styles.css')

// Tailwind-only at-rules with no meaning for a plain-CSS consumer.
const DROP = new Set(['custom-variant', 'variant', 'apply', 'tailwind', 'source', 'plugin', 'config'])

const root = postcss.parse(await Bun.file(SRC).text(), { from: SRC })

// Iterate a snapshot of the top-level nodes (every Tailwind at-rule we handle is
// top-level), so replaceWith/remove during the loop can't skip a sibling — which
// walkAtRules does when the current node is replaced mid-walk.
for (const at of [...root.nodes]) {
  if (at.type !== 'atrule') continue
  if (at.name === 'theme') {
    // @theme static { … } → @layer theme { :root { … } }: tokens become plain
    // custom properties for var() consumers, kept in the theme layer (same as the
    // dark block) so the cascade order — light here, dark later — still flips.
    const rule = postcss.rule({ raws: { between: ' ', semicolon: true }, selector: ':root' })
    for (const node of at.nodes ?? []) rule.append(node.clone())
    const layer = postcss.atRule({ name: 'layer', nodes: [rule], params: 'theme' })
    layer.raws.before = at.raws.before
    layer.raws.between = ' '
    layer.raws.after = '\n'
    at.replaceWith(layer)
  } else if (at.name === 'utility') {
    // @utility name { decls } → .name { decls }, so the typography presets survive
    // into the plain stylesheet. Only the static, declaration-only form maps to
    // plain CSS; a functional utility (name with `*`, or a body using
    // --value()/--modifier() or nested at-rules like @apply) has no plain-CSS
    // equivalent, so drop those instead.
    const name = at.params.trim()
    const isStatic = !name.includes('*') && (at.nodes ?? []).every(n => n.type === 'decl' || n.type === 'comment')
    if (isStatic) {
      const rule = postcss.rule({
        raws: { before: at.raws.before, between: ' ', semicolon: true },
        selector: `.${name}`
      })
      for (const node of at.nodes ?? []) rule.append(node.clone())
      at.replaceWith(rule)
    } else {
      const prev = at.prev()
      if (prev?.type === 'comment') prev.remove()
      at.remove()
    }
  } else if (DROP.has(at.name)) {
    // Drop the at-rule and the section comment that introduces it, so a header
    // like "VARIANTS — …" doesn't survive into the plain CSS without its rules.
    const prev = at.prev()
    if (prev?.type === 'comment') prev.remove()
    at.remove()
  }
}

// Replace the source header comment (it narrates Tailwind usage) with a banner.
if (root.first?.type === 'comment') root.first.remove()

const banner = '/* @plimeor/imprint-tokens — GENERATED from src/theme.css by build.ts. Do not edit by hand. */'
const body = root
  .toString()
  .replace(/\n{3,}/g, '\n\n')
  .replace(/^\n+/, '')
await Bun.write(OUT, `${banner}\n\n${body.trimEnd()}\n`)
console.log(`imprint-tokens: wrote dist/styles.css (${body.length} bytes)`)
