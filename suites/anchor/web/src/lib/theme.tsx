import { ScriptOnce } from '@tanstack/react-router'
import { type ReactNode, useEffect, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'system'

const STORAGE_KEY = 'anchor-theme'
const DEFAULT_MODE: ThemeMode = 'system'
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

// Pre-paint stamp injected before the app renders, so the first frame already
// has the right theme. Mirrors storedMode()/resolveMode() below — keep in sync.
export const THEME_INIT_SCRIPT = `
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

interface ThemeSnapshot {
  theme: Theme
  themeMode: ThemeMode
}

// themeMode is the user preference (light/dark/system); theme is the applied
// value (light/dark). Both are only ever written together by commit(), so they
// cannot drift apart. The snapshot reference is stable between commits so
// useSyncExternalStore does not loop.
const initialMode = storedMode()
let snapshot: ThemeSnapshot = { theme: resolveMode(initialMode), themeMode: initialMode }

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ThemeSnapshot {
  return snapshot
}

export function theme(): Theme {
  return snapshot.theme
}

export function themeMode(): ThemeMode {
  return snapshot.themeMode
}

function commit(next: ThemeMode, persist: boolean): void {
  const resolved = resolveMode(next)
  snapshot = { theme: resolved, themeMode: next }
  for (const listener of listeners) listener()
  if (persist) localStorage.setItem(STORAGE_KEY, next)
  stampRoot(resolved)
  syncThemeColorMeta()
  syncTauriWindowTheme(resolved)
}

export function setThemeMode(next: ThemeMode): void {
  commit(next, true)
}

/** Reactive read of the live theme state for components. */
export function useTheme(): ThemeSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function ThemeProvider(props: { children: ReactNode }) {
  useEffect(() => {
    commit(storedMode(), false)

    const systemQuery = window.matchMedia(SYSTEM_DARK_QUERY)
    const onSystemChange = () => {
      if (snapshot.themeMode === 'system') commit('system', false)
    }
    systemQuery.addEventListener('change', onSystemChange)

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) commit(normalizeMode(event.newValue) ?? DEFAULT_MODE, false)
    }
    window.addEventListener('storage', onStorage)

    return () => {
      systemQuery.removeEventListener('change', onSystemChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return (
    <>
      <ScriptOnce>{THEME_INIT_SCRIPT}</ScriptOnce>
      {props.children}
    </>
  )
}

// Stamp synchronously at module load, before the first render, so there is no
// flash of the wrong theme.
stampRoot(snapshot.theme)
