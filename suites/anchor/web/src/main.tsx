import { QueryClient, QueryClientProvider } from '@tanstack/solid-query'
import { ErrorBoundary } from 'solid-js'
import { render } from 'solid-js/web'

// Bundle the prose fonts locally (variable) — Anchor is offline-first, so the
// fonts offered in Settings → Appearance must not depend on a runtime CDN.
// These family names are the ones listed in src/lib/appearance.tsx (FONT_OPTIONS).
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource-variable/literata/index.css'
import '@fontsource-variable/lora/index.css'
import { App } from './App'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Anchor root element is missing')
}

if (!window.location.hash) {
  window.location.hash = '/'
}

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      networkMode: 'always'
    },
    queries: {
      networkMode: 'always'
    }
  }
})

render(
  () => (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary
        fallback={err => (
          <div class="app-fatal-error" data-testid="app-fatal-error">
            <strong>Anchor could not render this view.</strong>
            <pre>{err instanceof Error ? err.message : String(err)}</pre>
          </div>
        )}
      >
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  ),
  root
)
