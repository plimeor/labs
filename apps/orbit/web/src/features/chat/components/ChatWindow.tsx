import { motion } from 'framer-motion'
import { Square } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useChat } from '../hooks/useChat'
import { ChatInput } from './ChatInput'
import { ChatMessage } from './ChatMessage'
import { ProcessingIndicator } from './ProcessingIndicator'
import { TurnCard } from './TurnCard'

interface ChatWindowProps {
  agentName: string
}

export function ChatWindow({ agentName }: ChatWindowProps) {
  const { messages, streaming, isStreaming, toolEvents, error, send, abort, clearError } = useChat(agentName)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages and streaming updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const showProcessing = isStreaming && !streaming

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 && !showProcessing ? (
          <div className="flex h-full items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-light">
                <span className="text-accent text-lg">~</span>
              </div>
              <p className="font-semibold text-lg text-text-primary">Start a conversation</p>
              <p className="mt-1 text-sm text-text-secondary">
                Send a message to begin chatting with <span className="font-medium text-accent">{agentName}</span>
              </p>
            </motion.div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 px-5 py-6">
            {messages.map((message, index) => (
              <ChatMessage
                key={`${message.role}-${index}`}
                message={message}
                isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
              />
            ))}
            {toolEvents.length > 0 && <TurnCard events={toolEvents} />}
            {showProcessing && <ProcessingIndicator />}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between border-status-error/20 border-t bg-status-error/5 px-4 py-2">
          <span className="text-sm text-status-error">{error}</span>
          <button onClick={clearError} className="text-status-error/70 text-xs hover:text-status-error">
            Dismiss
          </button>
        </div>
      )}

      {/* Abort / Input */}
      <div className="relative">
        {isStreaming && (
          <div className="flex justify-center py-2">
            <button
              onClick={abort}
              className="flex items-center gap-1 rounded-full bg-surface-elevated px-4 py-2 font-medium text-text-secondary text-xs shadow-[var(--shadow-middle)] transition-colors hover:bg-surface-secondary"
            >
              <Square className="h-3 w-3" />
              Stop generating
            </button>
          </div>
        )}
        <ChatInput onSend={send} disabled={isStreaming} agentName={agentName} />
      </div>
    </div>
  )
}
