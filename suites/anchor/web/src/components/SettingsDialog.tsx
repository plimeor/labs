/**
 * SettingsDialog — the app's settings modal.
 *
 * Opened from the pinned Settings button at the bottom of the sidebar. Has its
 * own left nav (only "Appearance" this milestone) and a content panel. The
 * Appearance panel owns theme-mode selection plus the Typography section, whose
 * controls drive the runtime typography store (src/lib/appearance.tsx).
 *
 * Styled with Tailwind utilities bound to the theme tokens (no hand-written CSS).
 */

import { Monitor, Moon, Palette, RotateCcw, Sun, Terminal } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { type CliInstallResult, installAnchorCli } from '../backend/cli-install'
import {
  FONT_FIELDS,
  FONT_OPTIONS,
  type FontKey,
  type NumericTypographyKey,
  resetTypography,
  setTypography,
  TYPOGRAPHY_FIELDS,
  useTypography
} from '../lib/appearance'
import { setThemeMode, type ThemeMode, useTheme } from '../lib/theme'
import { Dialog, Select, Slider } from './ui'

const THEME_MODES: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { icon: <Monitor size={15} />, label: 'System', value: 'system' },
  { icon: <Sun size={15} />, label: 'Light', value: 'light' },
  { icon: <Moon size={15} />, label: 'Dark', value: 'dark' }
]

const SETTINGS_SECTIONS = [
  { icon: <Palette size={15} />, id: 'appearance', label: 'Appearance' },
  { icon: <Terminal size={15} />, id: 'cli', label: 'CLI' }
] as const
type SectionId = (typeof SETTINGS_SECTIONS)[number]['id']

function fontPreview(value: string): string | undefined {
  return value || undefined
}

function formatValue(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function roundToStep(value: number, step: number): number {
  const snapped = Math.round(value / step) * step
  return Math.round(snapped * 100) / 100
}

export interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog(props: SettingsDialogProps) {
  const [section, setSection] = useState<SectionId>('appearance')

  return (
    <Dialog
      className="grid h-[min(560px,100%)] w-[min(720px,100%)] grid-cols-[180px_minmax(0,1fr)]"
      open={props.open}
      title="Settings"
      onOpenChange={props.onOpenChange}
    >
      <nav
        className="grid content-start gap-0.5 border-line border-r bg-sidebar px-2.5 py-4"
        aria-label="Settings sections"
      >
        {SETTINGS_SECTIONS.map(item => (
          <button
            key={item.id}
            className="flex min-h-8 items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[13px] text-fg hover:bg-hover aria-[current=page]:bg-selected"
            aria-current={section === item.id ? 'page' : undefined}
            type="button"
            onClick={() => setSection(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="overflow-auto px-7 py-6" data-testid="settings-panel">
        {section === 'appearance' ? <AppearancePanel /> : null}
        {section === 'cli' ? <CliPanel /> : null}
      </div>
    </Dialog>
  )
}

function AppearancePanel() {
  return (
    <div data-testid="appearance-panel">
      <ThemeModeField />
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="m-0 font-medium text-[11px] text-fg-secondary uppercase tracking-[0.04em]">Typography</h3>
          <button
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-fg-secondary hover:bg-hover hover:text-fg"
            data-testid="reset-typography"
            type="button"
            onClick={() => resetTypography()}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>
        <div className="grid gap-3.5">
          {FONT_FIELDS.map(field => (
            <FontSelectRow key={field.key} fieldKey={field.key} />
          ))}
          {TYPOGRAPHY_FIELDS.map(field => (
            <TypographySliderRow key={field.key} fieldKey={field.key} />
          ))}
        </div>
      </section>
    </div>
  )
}

function ThemeModeField() {
  const { themeMode } = useTheme()

  return (
    <section className="mb-7">
      <h3 className="m-0 mb-3 font-medium text-[11px] text-fg-secondary uppercase tracking-[0.04em]">Theme</h3>
      <div
        className="inline-grid grid-flow-col gap-1 rounded-[9px] bg-[var(--surface-button)] p-[3px]"
        role="group"
        aria-label="Theme mode"
      >
        {THEME_MODES.map(mode => (
          <button
            key={mode.value}
            className="flex min-h-[30px] items-center gap-1.5 rounded-[7px] px-3.5 text-[13px] text-fg-secondary hover:text-fg aria-pressed:bg-popover aria-pressed:text-fg aria-pressed:shadow-[0_1px_2px_rgb(0_0_0/0.2)]"
            type="button"
            aria-pressed={themeMode === mode.value}
            onClick={() => setThemeMode(mode.value)}
          >
            {mode.icon}
            <span>{mode.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function CliPanel() {
  const [installing, setInstalling] = useState(false)
  const [result, setResult] = useState<CliInstallResult>()
  const [error, setError] = useState<string>()

  const handleInstall = async () => {
    setInstalling(true)
    setError(undefined)
    try {
      setResult(await installAnchorCli())
    } catch (caught) {
      setResult(undefined)
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <section>
      <h3 className="m-0 mb-3 font-medium text-[11px] text-fg-secondary uppercase tracking-[0.04em]">Command Line</h3>
      <div className="grid gap-3">
        <button
          className="inline-flex min-h-8 w-fit items-center gap-2 rounded-[7px] bg-[var(--surface-button)] px-3 text-[13px] text-fg hover:bg-hover disabled:opacity-60"
          disabled={installing}
          type="button"
          onClick={handleInstall}
        >
          <Terminal size={15} />
          <span>{installing ? 'Installing' : 'Install CLI'}</span>
        </button>
        {result ? (
          <div className="grid gap-1 text-[13px] text-fg-secondary">
            <span>Installed: {result.installedPath}</span>
            <span>Target: {result.targetPath}</span>
            {result.pathHint ? (
              <code className="w-fit rounded bg-[var(--surface-button)] px-2 py-1 text-fg">{result.pathHint}</code>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="m-0 text-[13px] text-danger">{error}</p> : null}
      </div>
    </section>
  )
}

function FontSelectRow(props: { fieldKey: FontKey }) {
  const settings = useTypography()
  const field = FONT_FIELDS.find(f => f.key === props.fieldKey)
  if (!field) throw new Error(`unknown font field: ${props.fieldKey}`)
  const value = settings[props.fieldKey]

  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3.5">
      <span className="text-[13px] text-fg">{field.label}</span>
      <Select
        aria-label={field.label}
        options={FONT_OPTIONS}
        previewFont={fontPreview}
        value={value}
        onValueChange={next => setTypography({ [props.fieldKey]: next })}
      />
    </div>
  )
}

function TypographySliderRow(props: { fieldKey: NumericTypographyKey }) {
  const settings = useTypography()
  const field = TYPOGRAPHY_FIELDS.find(f => f.key === props.fieldKey)
  if (!field) throw new Error(`unknown typography field: ${props.fieldKey}`)
  const value = settings[props.fieldKey]
  const markerCount = Math.min(21, Math.round((field.max - field.min) / field.step) + 1)

  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)_64px] items-center gap-3.5">
      <span className="text-[13px] text-fg">{field.label}</span>
      <Slider
        aria-label={field.label}
        markers={markerCount}
        max={field.max}
        min={field.min}
        step={field.step}
        value={value}
        onValueChange={next => setTypography({ [props.fieldKey]: roundToStep(next, field.step) })}
      />
      <span className="text-right text-[13px] text-fg-secondary tabular-nums">
        {formatValue(value)} {field.unit}
      </span>
    </div>
  )
}
