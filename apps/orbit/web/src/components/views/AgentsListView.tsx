import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { Bot, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { useAgentStore } from '@/stores/agent.store'
import { useUIStore } from '@/stores/ui.store'

export function AgentsListView() {
  const navigate = useNavigate()
  const { agents, loading, fetchAgents, createAgent } = useAgentStore()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    useUIStore.getState().setView('agents')
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await createAgent(newName.trim())
      setNewName('')
      setShowCreate(false)
    } catch {
      // Error handled in store
    } finally {
      setCreating(false)
    }
  }

  const handleAgentClick = (name: string) => {
    navigate(`/agents/${name}`)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="flex h-full flex-col">
      <Group justify="space-between" className="border-border-default border-b px-6 py-4">
        <Group gap="sm">
          <Bot className="h-5 w-5 text-accent" />
          <Title order={3}>Agents</Title>
          <Badge variant="light" size="sm">
            {agents.length}
          </Badge>
        </Group>
        <Group gap="sm">
          <Button leftSection={<Plus className="h-3.5 w-3.5" />} size="sm" onClick={() => setShowCreate(true)}>
            New Agent
          </Button>
          <Tooltip label="Refresh agents" position="bottom" offset={8}>
            <ActionIcon variant="subtle" onClick={fetchAgents} disabled={loading} loading={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <ScrollArea scrollbarSize={6} type="hover" className="min-h-0 flex-1">
        <div className="h-full w-full p-6">
          {agents.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Stack align="center" gap="sm">
                <div className="inline-block rounded-2xl bg-accent-light p-4">
                  <Bot className="h-8 w-8 text-accent-muted" />
                </div>
                <Text size="sm" c="dimmed">
                  No agents configured
                </Text>
                <Button variant="subtle" size="compact-sm" onClick={() => setShowCreate(true)}>
                  Create one
                </Button>
              </Stack>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {agents.map(agent => (
                <Paper
                  key={agent.name}
                  shadow="xs"
                  p="md"
                  radius="md"
                  onClick={() => handleAgentClick(agent.name)}
                  className="cursor-pointer transition-all hover:shadow-md"
                  withBorder
                >
                  <Group gap="md" mb="sm">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-light">
                      <Bot className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <Text fw={500}>{agent.name}</Text>
                      <Group gap={6}>
                        <Badge variant="light" color={agent.status === 'active' ? 'green' : 'gray'} size="xs">
                          {agent.status}
                        </Badge>
                      </Group>
                    </div>
                  </Group>
                  <Stack gap={4}>
                    <Text size="xs" c="dimmed">
                      Created: {formatDate(agent.createdAt)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Last active: {formatDate(agent.lastActiveAt)}
                    </Text>
                  </Stack>
                </Paper>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Modal opened={showCreate} onClose={() => setShowCreate(false)} title="Create Agent" centered>
        <form onSubmit={handleCreate}>
          <Stack gap="md">
            <TextInput
              label="Agent Name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. researcher"
              required
              autoFocus
            />
            <Group justify="flex-end" gap="sm">
              <Button variant="subtle" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !newName.trim()} loading={creating}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </div>
  )
}
