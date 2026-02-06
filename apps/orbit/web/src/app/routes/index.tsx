import { createBrowserRouter } from 'react-router'

import { ChatPage } from './ChatPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <ChatPage />
  },
  {
    path: '/chat/:agentName',
    element: <ChatPage />
  }
])

export default router
