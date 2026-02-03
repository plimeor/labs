import { Bot, Settings } from 'lucide-react'
import { useParams } from 'react-router'

import { ChatWindow } from '../../features/chat'

const DEFAULT_AGENT = 'main'

export function ChatPage() {
  const { agentName } = useParams<{ agentName: string }>()
  const agent = agentName || DEFAULT_AGENT

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">{agent}</h1>
            <p className="text-xs text-gray-500">Personal AI Assistant</p>
          </div>
        </div>
        <button className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
          <Settings className="h-5 w-5" />
        </button>
      </header>

      {/* Chat */}
      <main className="flex-1 overflow-hidden">
        <ChatWindow agentName={agent} />
      </main>
    </div>
  )
}
