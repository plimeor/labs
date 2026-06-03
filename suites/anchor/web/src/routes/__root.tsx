import { useMutation, useQuery } from '@tanstack/solid-query'
import { createRootRoute, HeadContent, Link, Outlet } from '@tanstack/solid-router'
import { Bot, Database, FlaskConical, FolderOpen, GitBranch, Home, Search, Settings, Tags } from 'lucide-solid'
import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show, Suspense } from 'solid-js'

import { SettingsDialog } from '../components/SettingsDialog'
import { Button } from '../components/ui'
import { useAnchor } from '../lib/anchor-context'
import { ThemeProvider } from '../lib/theme'

export const Route = createRootRoute({
  component: RootLayout,
  // Static head only — Router owns static metas; ThemeProvider owns the
  // dynamic color-scheme/theme-color values keyed to the resolved theme.
  head: () => ({
    meta: [{ title: 'Anchor' }, { content: 'light dark', name: 'color-scheme' }]
  })
})

function RootLayout() {
  return (
    <ThemeProvider>
      <ShellLayout />
    </ThemeProvider>
  )
}

function ShellLayout() {
  const anchor = useAnchor()
  const [hashPath, setHashPath] = createSignal(normalizeHashPath(window.location.hash))
  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const isPlaygroundRoute = createMemo(() => hashPath().startsWith('/playground'))
  const diagnostics = useQuery(() => ({
    enabled: !isPlaygroundRoute(),
    queryKey: ['diagnostics', anchor.vaultRevision()],
    queryFn: () => anchor.backend.diagnostics()
  }))
  const notes = useQuery(() => ({
    enabled: !isPlaygroundRoute(),
    queryKey: ['notes', anchor.vaultRevision()],
    queryFn: () => anchor.backend.listNotes()
  }))
  const openDemoVault = useMutation(() => ({
    mutationFn: () => anchor.backend.openDemoVault(),
    onSuccess: () => {
      anchor.resetVaultSession()
    }
  }))
  const openVault = useMutation(() => ({
    mutationFn: () => anchor.backend.openVault(),
    onSuccess: diagnostics => {
      if (diagnostics) {
        anchor.resetVaultSession()
      }
    }
  }))

  onMount(() => {
    const syncHashPath = () => setHashPath(normalizeHashPath(window.location.hash))
    window.addEventListener('hashchange', syncHashPath)
    onCleanup(() => window.removeEventListener('hashchange', syncHashPath))
  })

  return (
    <>
      <HeadContent />
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-mark">A</div>
            <div>
              <strong>Anchor</strong>
              <span>agent-safe notes</span>
            </div>
          </div>
          <div class="vault-actions">
            <button class="vault-button" data-testid="open-vault" type="button" onClick={() => openVault.mutate()}>
              <FolderOpen size={15} />
              <span>Open vault</span>
            </button>
            <button
              class="vault-button secondary"
              data-testid="open-demo-vault"
              type="button"
              onClick={() => openDemoVault.mutate()}
            >
              <Database size={15} />
              <span>{diagnostics.data?.currentVault ? 'Reload demo vault' : 'Load demo vault'}</span>
            </button>
          </div>
          <nav class="main-nav">
            <NavItem icon={<Home size={15} />} label="Today" to="/today" />
            <NavItem icon={<Search size={15} />} label="Search" to="/search" />
            <NavItem icon={<GitBranch size={15} />} label="Graph" to="/graph" />
            <NavItem icon={<Tags size={15} />} label="Objects" to="/objects" />
            <NavItem icon={<Bot size={15} />} label="Agents" to="/agents" />
            <NavItem icon={<FlaskConical size={15} />} label="Playground" to="/playground" />
          </nav>
          <section class="note-list">
            <div class="section-title">
              <span>Notes</span>
              <span>{notes.data?.length ?? 0}</span>
            </div>
            <For each={notes.data ?? []}>
              {note => (
                <Link class="note-row" to="/notes/$noteId" params={{ noteId: note.id }}>
                  <span>{note.title}</span>
                  <Show when={anchor.dirtyNoteIds().has(note.id)}>
                    <span class="dirty-dot" />
                  </Show>
                </Link>
              )}
            </For>
          </section>
          <div class="mt-2 border-line-subtle border-t pt-2">
            <button
              class="nav-item w-full"
              data-testid="open-settings"
              type="button"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={15} />
              <span>Settings</span>
            </button>
          </div>
        </aside>
        <main class="main-panel">
          <Show
            when={isPlaygroundRoute() || diagnostics.data?.currentVault}
            fallback={<EmptyVault onOpenDemo={() => openDemoVault.mutate()} onOpenVault={() => openVault.mutate()} />}
          >
            <Suspense fallback={<div class="route-loading">Loading view</div>}>
              <Outlet />
            </Suspense>
          </Show>
        </main>
      </div>
      <SettingsDialog open={settingsOpen()} onOpenChange={setSettingsOpen} />
    </>
  )
}

function normalizeHashPath(hash: string): string {
  const normalized = hash.replace(/^#/, '') || '/'
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function NavItem(props: { icon: JSX.Element; label: string; to: string }) {
  return (
    <Link activeProps={{ class: 'active' }} class="nav-item" to={props.to}>
      {props.icon}
      <span>{props.label}</span>
    </Link>
  )
}

function EmptyVault(props: { onOpenDemo: () => void; onOpenVault: () => void }) {
  return (
    <div class="empty-vault" data-testid="empty-vault">
      <Database size={34} />
      <h1>Open a local vault</h1>
      <p>Anchor rebuilds its session projection from Markdown, config, and operation records on open.</p>
      <Button variant="primary" onClick={props.onOpenVault}>
        Open vault
      </Button>
      <Button variant="secondary" onClick={props.onOpenDemo}>
        Load demo vault
      </Button>
    </div>
  )
}
