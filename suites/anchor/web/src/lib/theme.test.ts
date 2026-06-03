/**
 * theme — behavioral tests in happy-dom. theme.tsx exposes the themeMode/theme
 * signal accessors plus setThemeMode/ThemeProvider, so we drive setThemeMode and
 * assert the global signals, the DOM stamp, and localStorage. The module stamps
 * the DOM at import, so happy-dom must be registered first.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

let mod: typeof import('./theme')
let setMode: (mode: 'light' | 'dark' | 'system') => void
let osDark = false

function matchMediaForCurrentOs(query: string) {
  return {
    matches: osDark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  }
}

beforeAll(async () => {
  GlobalRegistrator.register({ url: 'http://localhost/' })
  ;(window as unknown as { matchMedia: unknown }).matchMedia = matchMediaForCurrentOs
  localStorage.clear()
  mod = await import('./theme')
  setMode = mod.setThemeMode
})

afterAll(() => {
  GlobalRegistrator.unregister()
})

describe('initialization', () => {
  test('defaults to the system preference, resolved from the light OS, stamped at import', () => {
    expect(mod.themeMode()).toBe('system')
    expect(mod.theme()).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

describe('setMode', () => {
  test('updates the signals, data-theme, color-scheme and storage', () => {
    setMode('dark')
    expect(mod.themeMode()).toBe('dark')
    expect(mod.theme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(localStorage.getItem('anchor-theme')).toBe('dark')

    setMode('light')
    expect(mod.theme()).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(localStorage.getItem('anchor-theme')).toBe('light')
  })

  test('system mode follows prefers-color-scheme and never stamps "system"', () => {
    osDark = true
    setMode('system')
    expect(mod.themeMode()).toBe('system')
    expect(mod.theme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('anchor-theme')).toBe('system')

    osDark = false
    setMode('system')
    expect(mod.theme()).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
