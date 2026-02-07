import { createBrowserRouter } from 'react-router'

import { AppLayout } from '@/components/layout/AppLayout'
import { AgentConfigView } from '@/components/views/AgentConfigView'
import { AgentsListView } from '@/components/views/AgentsListView'
import { InboxView } from '@/components/views/InboxView'
import { TasksView } from '@/components/views/TasksView'

import { ChatPage } from './ChatPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: 'chat', element: <ChatPage /> },
      { path: 'chat/:agentName', element: <ChatPage /> },
      { path: 'chat/:agentName/:sessionId', element: <ChatPage /> },
      { path: 'inbox', element: <InboxView /> },
      { path: 'tasks', element: <TasksView /> },
      { path: 'agents', element: <AgentsListView /> },
      { path: 'agents/:name', element: <AgentConfigView /> }
    ]
  }
])

export default router
