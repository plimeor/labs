import { useEffect, useRef } from 'react'
import { useParams } from 'react-router'

import { ChatWindow } from '@/features/chat'
import { useSessionStore } from '@/stores/session.store'
import { useUIStore } from '@/stores/ui.store'

const DEFAULT_AGENT = 'main'

export function ChatPage() {
  const { agentName, sessionId } = useParams<{
    agentName?: string
    sessionId?: string
  }>()
  const agent = agentName || DEFAULT_AGENT

  const prevAgent = useRef<string | null>(null)
  const prevSession = useRef<string | null>(null)

  useEffect(() => {
    if (prevAgent.current !== agent) {
      prevAgent.current = agent
      useUIStore.setState({ view: 'chat', activeAgent: agent })
    }
  }, [agent])

  useEffect(() => {
    if (sessionId && prevSession.current !== sessionId) {
      prevSession.current = sessionId
      useUIStore.setState({ activeSessionId: sessionId })
      useSessionStore.getState().fetchMessages(agent, sessionId)
    }
  }, [sessionId, agent])

  return <ChatWindow agentName={agent} />
}
