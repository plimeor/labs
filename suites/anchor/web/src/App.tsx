import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'

import { AnchorProvider } from './lib/anchor-context'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  history: createHashHistory(),
  routeTree
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export function App() {
  return (
    <AnchorProvider>
      <RouterProvider router={router} />
    </AnchorProvider>
  )
}
