import { User, Bot } from 'lucide-react'

import type { ChatMessage as ChatMessageType } from '../api/chat.api'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 p-4 ${isUser ? 'bg-gray-50' : 'bg-white'}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-blue-500' : 'bg-gray-700'
        }`}
      >
        {isUser ? <User className="h-5 w-5 text-white" /> : <Bot className="h-5 w-5 text-white" />}
      </div>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-gray-900">{isUser ? 'You' : 'Assistant'}</p>
        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    </div>
  )
}
