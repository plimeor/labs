import { useState, useCallback } from 'react'

import { sendMessage, type ChatMessage } from '../api/chat.api'

export function useChat(agentName: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (content: string) => {
      if (!content.trim()) return

      setIsLoading(true)
      setError(null)

      // Add user message immediately
      const userMessage: ChatMessage = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, userMessage])

      try {
        const response = await sendMessage(agentName, content, sessionId || undefined)

        // Update session ID
        if (!sessionId) {
          setSessionId(response.sessionId)
        }

        // Add assistant message
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: response.response,
          timestamp: new Date().toISOString(),
        }
        setMessages(prev => [...prev, assistantMessage])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
        // Remove the user message on error
        setMessages(prev => prev.slice(0, -1))
      } finally {
        setIsLoading(false)
      }
    },
    [agentName, sessionId],
  )

  const clearChat = useCallback(() => {
    setMessages([])
    setSessionId(null)
    setError(null)
  }, [])

  return {
    messages,
    sessionId,
    isLoading,
    error,
    send,
    clearChat,
  }
}
