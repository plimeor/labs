import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip
} from '@mantine/core'
import { Archive, Inbox, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { InboxMessage } from '@/lib/api'
import { api } from '@/lib/api'
import { useAgentStore } from '@/stores/agent.store'
import { useUIStore } from '@/stores/ui.store'

export function InboxView() {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<InboxMessage | null>(null)
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

  const statusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'yellow'
      case 'claimed':
        return 'violet'
      default:
        return 'gray'
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Group justify="space-between" className="border-border-default border-b px-6 py-4">
        <Group gap="sm">
          <Inbox className="h-5 w-5 text-accent" />
          <Title order={3}>Inbox</Title>
          <Badge variant="light" size="sm">
            {messages.length}
          </Badge>
        </Group>
        <Tooltip label="Refresh inbox" position="bottom" offset={8}>
          <ActionIcon variant="subtle" onClick={fetchInbox} disabled={loading} loading={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <ScrollArea scrollbarSize={6} type="hover" className="flex-1 overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Stack align="center" gap="sm">
              <div className="inline-block rounded-2xl bg-accent-light p-4">
                <Inbox className="h-8 w-8 text-accent-muted" />
              </div>
              <Text size="sm" c="dimmed">
                No inbox messages
              </Text>
            </Stack>
          </div>
        ) : (
          <Stack gap={0}>
            {messages.map((msg, index) => (
              <div key={msg.id}>
                {index > 0 && (
                  <div className="px-6">
                    <Divider />
                  </div>
                )}
                <Group
                  gap="md"
                  align="flex-start"
                  wrap="nowrap"
                  className="px-6 py-4 transition-colors hover:bg-surface-secondary/60"
                >
                  <div className="min-w-0 flex-1">
                    <Group gap="xs" mb={4}>
                      <Text size="sm" fw={500}>
                        {msg.fromAgent}
                      </Text>
                      <Text size="xs" c="dimmed">
                        &rarr;
                      </Text>
                      <Text size="sm" c="dimmed">
                        {msg.toAgent}
                      </Text>
                      <Badge variant="light" color={statusColor(msg.status)} size="xs">
                        {msg.status}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed" className="leading-relaxed">
                      {msg.message}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      {formatDate(msg.createdAt)}
                    </Text>
                  </div>
                  <Tooltip label="Archive" position="left" offset={8}>
                    <ActionIcon variant="subtle" onClick={() => setArchiveTarget(msg)}>
                      <Archive className="h-4 w-4" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </div>
            ))}
          </Stack>
        )}
      </ScrollArea>

      <Modal
        opened={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title="Archive message"
        centered
        withCloseButton={false}
      >
        <Text size="sm" c="dimmed" className="leading-relaxed">
          Are you sure you want to archive this message
          {archiveTarget ? (
            <>
              {' '}
              from{' '}
              <Text span fw={500} c="var(--mantine-color-text)">
                {archiveTarget.fromAgent}
              </Text>{' '}
              to{' '}
              <Text span fw={500} c="var(--mantine-color-text)">
                {archiveTarget.toAgent}
              </Text>
            </>
          ) : null}
          ? This action cannot be undone.
        </Text>
        <Group justify="flex-end" mt="lg" gap="sm">
          <Button variant="subtle" onClick={() => setArchiveTarget(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (archiveTarget) {
                handleArchive(archiveTarget)
                setArchiveTarget(null)
              }
            }}
          >
            Archive
          </Button>
        </Group>
      </Modal>
    </div>
  )
}
