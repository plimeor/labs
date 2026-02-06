import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useChat } from '../hooks/useChat'
import { ChatInput } from './ChatInput'
import { ChatMessage } from './ChatMessage'

interface ChatWindowProps {
  agentName: string
}

export function ChatWindow({ agentName }: ChatWindowProps) {
  const { messages, isLoading, error, send } = useChat(agentName)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="font-medium text-lg">Start a conversation</p>
              <p className="mt-1 text-sm">Send a message to begin chatting with {agentName}</p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
            {isLoading && (
              <div className="flex items-center gap-3 bg-white p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
                <span className="text-gray-500 text-sm">Thinking...</span>
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && <div className="border-t bg-red-50 px-4 py-2 text-red-600 text-sm">{error}</div>}

      {/* Input */}
      <ChatInput onSend={send} disabled={isLoading} />
    </div>
  )
}
