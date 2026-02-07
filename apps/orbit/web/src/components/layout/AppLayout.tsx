import { Box } from '@mantine/core'
import { Outlet } from 'react-router'

import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <Box className="flex h-screen bg-surface-secondary p-1.5">
      <Box className="flex flex-1 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-elevated)]">
        <Sidebar />
        <Box component="main" className="min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
