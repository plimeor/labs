import { useMutation, useQuery } from '@tanstack/react-query'
import { createRootRoute, HeadContent, Link, Outlet } from '@tanstack/react-router'
import { Bot, Database, FlaskConical, FolderOpen, GitBranch, Home, Search, Settings, Tags } from 'lucide-react'
import { type ReactNode, Suspense, useEffect, useState } from 'react'

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
  const [hashPath, setHashPath] = useState(normalizeHashPath(window.location.hash))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isPlaygroundRoute = hashPath.startsWith('/playground')
  const diagnostics = useQuery({
    enabled: !isPlaygroundRoute,
    queryKey: ['diagnostics', anchor.vaultRevision],
    queryFn: () => anchor.backend.diagnostics()
  })
  const notes = useQuery({
    enabled: !isPlaygroundRoute,
    queryKey: ['notes', anchor.vaultRevision],
    queryFn: () => anchor.backend.listNotes()
  })
  const openDemoVault = useMutation({
    mutationFn: () => anchor.backend.openDemoVault(),
    onSuccess: () => {
      anchor.resetVaultSession()
    }
  })
  const openVault = useMutation({
    mutationFn: () => anchor.backend.openVault(),
    onSuccess: diagnostics => {
      if (diagnostics) {
        anchor.resetVaultSession()
      }
    }
  })

  useEffect(() => {
    const syncHashPath = () => setHashPath(normalizeHashPath(window.location.hash))
    window.addEventListener('hashchange', syncHashPath)
    return () => window.removeEventListener('hashchange', syncHashPath)
  }, [])

  return (
    <>
      <HeadContent />
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">A</div>
            <div>
              <strong>Anchor</strong>
              <span>agent-safe notes</span>
            </div>
          </div>
          <div className="vault-actions">
            <button className="vault-button" data-testid="open-vault" type="button" onClick={() => openVault.mutate()}>
              <FolderOpen size={15} />
              <span>Open vault</span>
            </button>
            <button
              className="vault-button secondary"
              data-testid="open-demo-vault"
              type="button"
              onClick={() => openDemoVault.mutate()}
            >
              <Database size={15} />
              <span>{diagnostics.data?.currentVault ? 'Reload demo vault' : 'Load demo vault'}</span>
            </button>
          </div>
          <nav className="main-nav">
            <NavItem icon={<Home size={15} />} label="Today" to="/today" />
            <NavItem icon={<Search size={15} />} label="Search" to="/search" />
            <NavItem icon={<GitBranch size={15} />} label="Graph" to="/graph" />
            <NavItem icon={<Tags size={15} />} label="Objects" to="/objects" />
            <NavItem icon={<Bot size={15} />} label="Agents" to="/agents" />
            <NavItem icon={<FlaskConical size={15} />} label="Playground" to="/playground" />
          </nav>
          <section className="note-list">
            <div className="section-title">
              <span>Notes</span>
              <span>{notes.data?.length ?? 0}</span>
            </div>
            {(notes.data ?? []).map(note => (
              <Link key={note.id} className="note-row" to="/notes/$noteId" params={{ noteId: note.id }}>
                <span>{note.title}</span>
                {anchor.dirtyNoteIds.has(note.id) ? <span className="dirty-dot" /> : null}
              </Link>
            ))}
          </section>
          <div className="mt-2 border-line-subtle border-t pt-2">
            <button
              className="nav-item w-full"
              data-testid="open-settings"
              type="button"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={15} />
              <span>Settings</span>
            </button>
          </div>
        </aside>
        <main className="main-panel">
          {isPlaygroundRoute || diagnostics.data?.currentVault ? (
            <Suspense fallback={<div className="route-loading">Loading view</div>}>
              <Outlet />
            </Suspense>
          ) : (
            <EmptyVault onOpenDemo={() => openDemoVault.mutate()} onOpenVault={() => openVault.mutate()} />
          )}
        </main>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}

function normalizeHashPath(hash: string): string {
  const normalized = hash.replace(/^#/, '') || '/'
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function NavItem(props: { icon: ReactNode; label: string; to: string }) {
  return (
    <Link activeProps={{ className: 'active' }} className="nav-item" to={props.to}>
      {props.icon}
      <span>{props.label}</span>
    </Link>
  )
}

function EmptyVault(props: { onOpenDemo: () => void; onOpenVault: () => void }) {
  return (
    <div className="empty-vault" data-testid="empty-vault">
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
