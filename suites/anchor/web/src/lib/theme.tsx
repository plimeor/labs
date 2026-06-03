import { ScriptOnce } from '@tanstack/solid-router'
import { createSignal, type JSX, onCleanup, onMount } from 'solid-js'

export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'

const STORAGE_KEY = 'anchor-theme'
const DEFAULT_MODE: ThemeMode = 'system'
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

// Pre-paint stamp injected before the app renders, so the first frame already
// has the right theme. Mirrors storedMode()/resolveMode() below — keep in sync.
const THEME_INIT_SCRIPT = `
(() => {
  const stored = localStorage.getItem('${STORAGE_KEY}')
  const mode = stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system'
  const resolved = mode === 'system'
    ? (window.matchMedia('${SYSTEM_DARK_QUERY}').matches ? 'dark' : 'light')
    : mode
  const root = document.documentElement
  root.setAttribute('data-theme', resolved)
  root.style.colorScheme = resolved
})()
`

function normalizeMode(value: unknown): ThemeMode | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null
}

function storedMode(): ThemeMode {
  return normalizeMode(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_MODE
}

function resolveMode(mode: ThemeMode): Theme {
  if (mode !== 'system') return mode
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light'
}

function stampRoot(theme: Theme): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.style.colorScheme = theme
}

// Keep the PWA address-bar colour in step with the resolved theme, reading the
// canonical value straight from the active token.
function syncThemeColorMeta(): void {
  const content = getComputedStyle(document.documentElement).getPropertyValue('--surface-app').trim()
  if (!content) return

  let tag = document.querySelector('meta[name="theme-color"]')
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', 'theme-color')
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function syncTauriWindowTheme(theme: Theme): void {
  if (!('__TAURI_INTERNALS__' in window)) return
  import('@tauri-apps/api/app')
    .then(({ setTheme }) => setTheme(theme))
    .catch(() => {
      // Native theme sync must never break the web app.
    })
}

// themeMode is the user preference (light/dark/system); theme is the applied
// value (light/dark). Both are only ever written together by commit(), so they
// cannot drift apart.
const initialMode = storedMode()
const [themeMode, setThemeModeSignal] = createSignal<ThemeMode>(initialMode)
const [theme, setThemeSignal] = createSignal<Theme>(resolveMode(initialMode))

export { theme, themeMode }

function commit(next: ThemeMode, persist: boolean): void {
  const resolved = resolveMode(next)
  setThemeModeSignal(next)
  setThemeSignal(resolved)
  if (persist) localStorage.setItem(STORAGE_KEY, next)
  stampRoot(resolved)
  syncThemeColorMeta()
  syncTauriWindowTheme(resolved)
}

export function setThemeMode(next: ThemeMode): void {
  commit(next, true)
}

export function ThemeProvider(props: { children: JSX.Element }) {
  onMount(() => {
    commit(storedMode(), false)

    const systemQuery = window.matchMedia(SYSTEM_DARK_QUERY)
    const onSystemChange = () => {
      if (themeMode() === 'system') commit('system', false)
    }
    systemQuery.addEventListener('change', onSystemChange)

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) commit(normalizeMode(event.newValue) ?? DEFAULT_MODE, false)
    }
    window.addEventListener('storage', onStorage)

    onCleanup(() => {
      systemQuery.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorage)
    })
  })

  return (
    <>
      <ScriptOnce children={THEME_INIT_SCRIPT} />
      {props.children}
    </>
  )
}

// Stamp synchronously at module load, before the first render, so there is no
// flash of the wrong theme.
stampRoot(theme())
