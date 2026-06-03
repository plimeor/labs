/**
 * Appearance — runtime typography settings for the editor.
 *
 * Mirrors the shape of theme.tsx: a single store module that is the source of
 * truth, persists to localStorage, and writes the live values onto the
 * document root as CSS custom properties. The editor surface consumes those
 * `--editor-*` variables (see styles.css), so changes apply instantly without
 * touching the CodeMirror instance.
 *
 * Fonts are bundled (not enumerated from the OS): the families listed in
 * FONT_OPTIONS are shipped via @fontsource-variable/* and imported in main.tsx,
 * so the picker offers the exact same set on every platform, fully offline.
 */

import { createSignal } from 'solid-js'

export interface TypographySettings {
  /** Body/prose font. A CSS font-family value, or '' for the app default. */
  textFont: string
  /** Heading font. '' = follow the text font (inherit). */
  headingFont: string
  /** Code font (inline + fenced blocks). '' = the app monospace default. */
  codeFont: string
  /** Editor body font size, in points. */
  fontSize: number
  /** Editor line height, as a unitless multiple (labelled "em" in the UI). */
  lineHeight: number
  /** Max width of the editor text column, in em. */
  lineWidth: number
  /** Extra space after each block, in em. */
  paragraphSpacing: number
  /** First-line indent of each block, in em. */
  paragraphIndent: number
}

/** The font (select-driven) keys of TypographySettings. */
export type FontKey = 'textFont' | 'headingFont' | 'codeFont'

/** The numeric (slider-driven) keys of TypographySettings. */
export type NumericTypographyKey = Exclude<keyof TypographySettings, FontKey>

export interface FontFieldSpec {
  key: FontKey
  label: string
}

/** Font selects, in display order. Shared by the store and the Settings UI. */
export const FONT_FIELDS: readonly FontFieldSpec[] = [
  { key: 'textFont', label: 'Text Font' },
  { key: 'headingFont', label: 'Headings Font' },
  { key: 'codeFont', label: 'Code Font' }
]

export interface TypographyFieldSpec {
  key: NumericTypographyKey
  label: string
  min: number
  max: number
  step: number
  /** Suffix shown next to the value, e.g. 'pt' or 'em'. */
  unit: string
}

/**
 * Slider specs for the numeric fields, in display order. Shared by the store
 * (defaults + clamping) and the Settings UI (slider bounds + value readout).
 */
export const TYPOGRAPHY_FIELDS: readonly TypographyFieldSpec[] = [
  { key: 'fontSize', label: 'Font Size', max: 30, min: 10, step: 1, unit: 'pt' },
  { key: 'lineHeight', label: 'Line Height', max: 2, min: 1, step: 0.1, unit: 'em' },
  { key: 'lineWidth', label: 'Line Width', max: 130, min: 32, step: 1, unit: 'em' },
  { key: 'paragraphSpacing', label: 'Paragraph Spacing', max: 2, min: 0, step: 0.1, unit: 'em' },
  { key: 'paragraphIndent', label: 'Paragraph Indent', max: 3, min: 0, step: 0.1, unit: 'em' }
]

export interface FontOption {
  label: string
  /** CSS font-family value; '' = app default. */
  value: string
}

/**
 * Bundled font families. Each non-default entry is shipped by a
 * @fontsource-variable/* package imported in main.tsx — keep the two in sync.
 */
export const FONT_OPTIONS: readonly FontOption[] = [
  { label: 'System default', value: '' },
  { label: 'Inter', value: '"Inter Variable", sans-serif' },
  { label: 'Lora', value: '"Lora Variable", serif' },
  { label: 'Literata', value: '"Literata Variable", serif' },
  { label: 'JetBrains Mono', value: '"JetBrains Mono Variable", monospace' }
]

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  codeFont: '',
  fontSize: 15,
  headingFont: '',
  lineHeight: 1.5,
  lineWidth: 48,
  paragraphIndent: 0,
  paragraphSpacing: 0,
  textFont: ''
}

const STORAGE_KEY = 'anchor-typography'

function clamp(value: number, spec: TypographyFieldSpec): number {
  if (!Number.isFinite(value)) return DEFAULT_TYPOGRAPHY[spec.key]
  return Math.min(spec.max, Math.max(spec.min, value))
}

/** Coerce arbitrary stored JSON into a valid, clamped settings object. */
function normalize(raw: unknown): TypographySettings {
  const source = (raw ?? {}) as Partial<Record<keyof TypographySettings, unknown>>
  const next: TypographySettings = { ...DEFAULT_TYPOGRAPHY }

  for (const field of FONT_FIELDS) {
    const value = source[field.key]
    if (typeof value === 'string' && FONT_OPTIONS.some(o => o.value === value)) next[field.key] = value
  }
  for (const spec of TYPOGRAPHY_FIELDS) {
    const value = source[spec.key]
    if (typeof value === 'number') next[spec.key] = clamp(value, spec)
  }
  return next
}

function load(): TypographySettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_TYPOGRAPHY }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return normalize(stored ? JSON.parse(stored) : null)
  } catch {
    return { ...DEFAULT_TYPOGRAPHY }
  }
}

/** Write the live settings onto :root as the `--editor-*` custom properties. */
function applyTypography(s: TypographySettings): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement.style
  root.setProperty('--editor-font-family', s.textFont || 'var(--font-sans)')
  // Empty heading font = follow the text font.
  root.setProperty('--editor-heading-font', s.headingFont || 'var(--editor-font-family)')
  root.setProperty('--editor-code-font', s.codeFont || 'var(--font-mono)')
  root.setProperty('--editor-font-size', `${s.fontSize}pt`)
  root.setProperty('--editor-line-height', String(s.lineHeight))
  root.setProperty('--editor-line-width', `${s.lineWidth}em`)
  root.setProperty('--editor-paragraph-spacing', `${s.paragraphSpacing}em`)
  root.setProperty('--editor-paragraph-indent', `${s.paragraphIndent}em`)
}

const [typography, setTypographySignal] = createSignal<TypographySettings>(load())

export { typography }

function commit(next: TypographySettings, persist: boolean): void {
  setTypographySignal(next)
  if (persist && typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
  applyTypography(next)
}

/** Patch one or more settings, persist, and re-apply. */
export function setTypography(patch: Partial<TypographySettings>): void {
  commit(normalize({ ...typography(), ...patch }), true)
}

/** Restore every typography setting to its default. */
export function resetTypography(): void {
  commit({ ...DEFAULT_TYPOGRAPHY }, true)
}

// Apply synchronously at module load, before the first render, so the editor's
// first paint already uses the stored typography.
applyTypography(typography())
