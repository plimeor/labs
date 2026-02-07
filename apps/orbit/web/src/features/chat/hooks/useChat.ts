import { useCallback, useMemo } from 'react'

import type { ChatMessage } from '@/lib/api'
import type { ToolEvent } from '@/stores/session.store'
import { useSessionStore } from '@/stores/session.store'
import { useUIStore } from '@/stores/ui.store'

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TOOL_EVENTS: ToolEvent[] = []

export function useChat(agentName: string) {
  const sessionId = useUIStore(s => s.activeSessionId)
  const msgKey = sessionId || `pending-${agentName}`
  const messages = useSessionStore(s => s.messages[msgKey] ?? EMPTY_MESSAGES)
  const streaming = useSessionStore(s => s.streaming)
  const isStreaming = useSessionStore(s => s.isStreaming)
  const error = useSessionStore(s => s.error)
  const toolEvents = useSessionStore(s => s.toolEvents[msgKey] ?? EMPTY_TOOL_EVENTS)
  const sendMessage = useSessionStore(s => s.sendMessage)
  const abortStream = useSessionStore(s => s.abortStream)
  const clearError = useSessionStore(s => s.clearError)

  const send = useCallback(
    async (content: string) => {
      if (!content.trim()) return
      const resolvedSessionId = await sendMessage(agentName, sessionId, content)
      if (resolvedSessionId && resolvedSessionId !== sessionId) {
        useUIStore.getState().setActiveSession(resolvedSessionId)
      }
    },
    [agentName, sessionId, sendMessage]
  )

  const allMessages: ChatMessage[] = useMemo(() => {
    if (!streaming) return messages
    return [
      ...messages,
      {
        role: 'assistant' as const,
        content: streaming,
        timestamp: new Date().toISOString()
      }
    ]
  }, [messages, streaming])

  return {
    messages: allMessages,
    streaming,
    isStreaming,
    toolEvents,
    error,
    send,
    abort: abortStream,
    clearError
  }
}
