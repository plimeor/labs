import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

// Bundle the prose fonts locally (variable) — Anchor is offline-first, so the
// fonts offered in Settings → Appearance must not depend on a runtime CDN.
// These family names are the ones listed in src/lib/appearance.tsx (FONT_OPTIONS).
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@fontsource-variable/literata/index.css'
import '@fontsource-variable/lora/index.css'
import { App } from './App'
import './styles.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | undefined
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: undefined }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {}

  render(): ReactNode {
    const { error } = this.state

    if (error) {
      return (
        <div className="app-fatal-error" data-testid="app-fatal-error">
          <strong>Anchor could not render this view.</strong>
          <pre>{error.message}</pre>
        </div>
      )
    }

    return this.props.children
  }
}

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

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </QueryClientProvider>
)
