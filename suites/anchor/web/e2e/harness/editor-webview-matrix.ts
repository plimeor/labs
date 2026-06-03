export const REQUIRED_BUN_WEBVIEW_VERSION = '1.3.14'

export type EditorWebViewBackend = 'chrome' | 'webkit'

const DEFAULT_BACKENDS: EditorWebViewBackend[] = ['webkit', 'chrome']

export function assertPinnedBunWebViewVersion(): void {
  if (Bun.version !== REQUIRED_BUN_WEBVIEW_VERSION) {
    throw new Error(
      `Bun.WebView harness is pinned to Bun ${REQUIRED_BUN_WEBVIEW_VERSION}; current Bun is ${Bun.version}`
    )
  }
}

export function editorWebViewBackends(): EditorWebViewBackend[] {
  const raw = process.env.ANCHOR_E2E_WEBVIEW_BACKENDS?.trim()
  if (!raw) return DEFAULT_BACKENDS

  const backends = raw.split(',').map(part => part.trim()) as EditorWebViewBackend[]
  for (const backend of backends) {
    if (backend !== 'webkit' && backend !== 'chrome') {
      throw new Error(`Unsupported Bun.WebView backend: ${backend}`)
    }
  }

  return backends
}

export function isEditorWebViewE2EEnabled(): boolean {
  return process.env.ANCHOR_E2E_WEBVIEW === '1'
}
