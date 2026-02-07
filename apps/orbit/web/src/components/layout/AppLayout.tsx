import { Outlet } from 'react-router'

import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="flex h-screen bg-surface-secondary p-1.5">
      <div className="flex flex-1 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-middle)]">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
