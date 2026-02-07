import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { Calendar, Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { Task } from '@/lib/api'
import { api } from '@/lib/api'
import { useAgentStore } from '@/stores/agent.store'
import { useUIStore } from '@/stores/ui.store'

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const { agents, fetchAgents } = useAgentStore()

  useEffect(() => {
    useUIStore.getState().setView('tasks')
  }, [])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const { tasks: allTasks } = await api.tasks.listAll()
      setTasks(allTasks)
    } catch {
      // Try fetching per-agent if global endpoint fails
      if (agents.length === 0) await fetchAgents()
      const currentAgents = useAgentStore.getState().agents
      const allTasks: Task[] = []
      for (const agent of currentAgents) {
        try {
          const { tasks: agentTasks } = await api.tasks.list(agent.name)
          allTasks.push(...agentTasks)
        } catch {
          // Skip
        }
      }
      setTasks(allTasks)
    } finally {
      setLoading(false)
    }
  }, [agents.length, fetchAgents])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const handleToggle = async (task: Task) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active'
    try {
      await api.tasks.update(task.agentName, task.id, { status: newStatus })
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: newStatus } : t)))
    } catch {
      // Silently fail
    }
  }

  const handleDelete = async (task: Task) => {
    try {
      await api.tasks.delete(task.agentName, task.id)
      setTasks(prev => prev.filter(t => t.id !== task.id))
    } catch {
      // Silently fail
    }
  }

  const confirmDelete = async () => {
    if (!taskToDelete) return
    await handleDelete(taskToDelete)
    setTaskToDelete(null)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="flex h-full flex-col">
      <Group justify="space-between" className="border-border-default border-b px-6 py-4">
        <Group gap="sm">
          <Calendar className="h-5 w-5 text-accent" />
          <Title order={3}>Tasks</Title>
          <Badge variant="light" size="sm">
            {tasks.length}
          </Badge>
        </Group>
        <Group gap="sm">
          <Button leftSection={<Plus className="h-3.5 w-3.5" />} size="sm" onClick={() => setShowCreate(true)}>
            New Task
          </Button>
          <Tooltip label="Refresh tasks" position="bottom" offset={8}>
            <ActionIcon variant="subtle" onClick={fetchTasks} disabled={loading} loading={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <ScrollArea scrollbarSize={6} type="hover" className="min-h-0 flex-1">
        {tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Stack align="center" gap="sm">
              <div className="inline-block rounded-2xl bg-accent-light p-4">
                <Calendar className="h-8 w-8 text-accent-muted" />
              </div>
              <Text size="sm" c="dimmed">
                No scheduled tasks
              </Text>
              <Button variant="subtle" size="compact-sm" onClick={() => setShowCreate(true)}>
                Create one
              </Button>
            </Stack>
          </div>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="px-6">Name</Table.Th>
                <Table.Th>Agent</Table.Th>
                <Table.Th>Schedule</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Last Run</Table.Th>
                <Table.Th>Next Run</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tasks.map(task => (
                <Table.Tr key={task.id}>
                  <Table.Td className="px-6">
                    <Text size="sm" fw={500}>
                      {task.name || task.prompt.slice(0, 40)}
                    </Text>
                    <Text size="xs" c="dimmed" truncate className="max-w-xs">
                      {task.prompt}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {task.agentName}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Badge variant="light" color="gray" size="xs">
                        {task.scheduleType}
                      </Badge>
                      <Text size="sm" c="dimmed">
                        {task.scheduleValue}
                      </Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={task.status === 'active' ? 'green' : 'gray'} size="sm">
                      {task.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {formatDate(task.lastRun)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {formatDate(task.nextRun)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Tooltip label={task.status === 'active' ? 'Pause' : 'Resume'} position="bottom">
                        <ActionIcon variant="subtle" onClick={() => handleToggle(task)} size="sm">
                          {task.status === 'active' ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete" position="bottom">
                        <ActionIcon variant="subtle" color="red" onClick={() => setTaskToDelete(task)} size="sm">
                          <Trash2 className="h-3.5 w-3.5" />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </ScrollArea>

      {/* Create Task Dialog */}
      <CreateTaskDialog
        agents={agents}
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => {
          setShowCreate(false)
          fetchTasks()
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        opened={taskToDelete !== null}
        onClose={() => setTaskToDelete(null)}
        title="Delete Task"
        centered
        withCloseButton={false}
      >
        <Text size="sm" c="dimmed">
          Are you sure you want to delete{' '}
          <Text span fw={500} c="var(--mantine-color-text)">
            {taskToDelete?.name || taskToDelete?.prompt.slice(0, 40)}
          </Text>
          ? This action cannot be undone.
        </Text>
        <Group justify="flex-end" mt="lg" gap="sm">
          <Button variant="subtle" onClick={() => setTaskToDelete(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Task Dialog
// ---------------------------------------------------------------------------

function CreateTaskDialog({
  agents,
  open,
  onOpenChange,
  onCreated
}: {
  agents: { name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [agentName, setAgentName] = useState(agents[0]?.name || '')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval' | 'once'>('interval')
  const [scheduleValue, setScheduleValue] = useState('1h')
  const [contextMode, setContextMode] = useState<'isolated' | 'main'>('isolated')
  const [submitting, setSubmitting] = useState(false)

  // Reset agentName when agents list changes
  useEffect(() => {
    if (agents.length > 0 && !agentName) {
      setAgentName(agents[0].name)
    }
  }, [agents, agentName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentName || !prompt) return
    setSubmitting(true)
    try {
      await api.tasks.create(agentName, {
        prompt,
        scheduleType,
        scheduleValue,
        contextMode,
        name: name || undefined
      })
      onCreated()
    } catch {
      // Silently fail
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal opened={open} onClose={() => onOpenChange(false)} title="Create Task" centered>
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {/* Agent */}
          <Select
            label="Agent"
            value={agentName}
            onChange={val => val && setAgentName(val)}
            data={agents.map(a => ({ value: a.name, label: a.name }))}
          />

          {/* Name */}
          <TextInput
            label="Name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My task"
          />

          {/* Prompt */}
          <Textarea
            label="Prompt"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            placeholder="What should the agent do?"
            required
          />

          {/* Schedule Type + Value */}
          <Group grow gap="md">
            <Select
              label="Schedule Type"
              value={scheduleType}
              onChange={val => val && setScheduleType(val as 'cron' | 'interval' | 'once')}
              data={[
                { value: 'interval', label: 'Interval' },
                { value: 'cron', label: 'Cron' },
                { value: 'once', label: 'Once' }
              ]}
            />
            <TextInput
              label="Schedule Value"
              value={scheduleValue}
              onChange={e => setScheduleValue(e.target.value)}
              placeholder={scheduleType === 'cron' ? '*/5 * * * *' : '1h'}
              required
            />
          </Group>

          {/* Context Mode */}
          <Select
            label="Context Mode"
            value={contextMode}
            onChange={val => val && setContextMode(val as 'isolated' | 'main')}
            data={[
              { value: 'isolated', label: 'Isolated' },
              { value: 'main', label: 'Main' }
            ]}
          />

          {/* Actions */}
          <Group justify="flex-end" gap="sm" pt="xs">
            <Button variant="subtle" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !prompt} loading={submitting}>
              Create Task
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
