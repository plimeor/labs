import { Archive, Inbox, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { InboxMessage } from '@/lib/api'
import { api } from '@/lib/api'
import { useAgentStore } from '@/stores/agent.store'
import { useUIStore } from '@/stores/ui.store'

export function InboxView() {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(false)
  const { agents, fetchAgents } = useAgentStore()

  useEffect(() => {
    useUIStore.getState().setView('inbox')
  }, [])

  const fetchInbox = useCallback(async () => {
    setLoading(true)
    try {
      if (agents.length === 0) {
        await fetchAgents()
      }
      const currentAgents = useAgentStore.getState().agents
      const allMessages: InboxMessage[] = []
      for (const agent of currentAgents) {
        try {
          const { messages: agentMessages } = await api.inbox.list(agent.name)
          allMessages.push(...agentMessages)
        } catch {
          // Skip agents with no inbox
        }
      }
      allMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setMessages(allMessages)
    } finally {
      setLoading(false)
    }
  }, [agents.length, fetchAgents])

  useEffect(() => {
    fetchInbox()
  }, [fetchInbox])

  const handleArchive = async (msg: InboxMessage) => {
    try {
      await api.inbox.archive(msg.toAgent, msg.id)
      setMessages(prev => prev.filter(m => m.id !== msg.id))
    } catch {
      // Silently fail
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-border-default border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-accent" />
          <h1 className="font-semibold text-lg text-text-primary">Inbox</h1>
          <span className="rounded-full bg-accent-light px-2 py-0.5 font-medium text-accent text-xs">
            {messages.length}
          </span>
        </div>
        <button
          onClick={fetchInbox}
          disabled={loading}
          className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-3 inline-block rounded-2xl bg-accent-light p-4">
                <Inbox className="h-8 w-8 text-accent-muted" />
              </div>
              <p className="text-sm text-text-secondary">No inbox messages</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {messages.map(msg => (
              <div
                key={msg.id}
                className="flex items-start gap-3 px-6 py-4 transition-colors hover:bg-surface-secondary/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-sm text-text-primary">{msg.fromAgent}</span>
                    <span className="text-text-tertiary text-xs">&rarr;</span>
                    <span className="text-sm text-text-secondary">{msg.toAgent}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-xs ${
                        msg.status === 'pending'
                          ? 'bg-status-warning/10 text-status-warning'
                          : msg.status === 'claimed'
                            ? 'bg-accent-light text-accent'
                            : 'bg-surface-secondary text-text-secondary'
                      }`}
                    >
                      {msg.status}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed">{msg.message}</p>
                  <p className="mt-1 text-text-tertiary text-xs">{formatDate(msg.createdAt)}</p>
                </div>
                <button
                  onClick={() => handleArchive(msg)}
                  className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary"
                  title="Archive"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
