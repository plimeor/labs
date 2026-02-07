import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from '@mantine/core'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import type { Agent } from '@/lib/api'
import { api } from '@/lib/api'
import { useAgentStore } from '@/stores/agent.store'
import { useUIStore } from '@/stores/ui.store'

export function AgentConfigView() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const { fetchAgents } = useAgentStore()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [model, setModel] = useState('')
  const [permissionMode, setPermissionMode] = useState('default')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    useUIStore.getState().setView('agent-config')
  }, [])

  const loadAgent = useCallback(async () => {
    if (!name) return
    setLoading(true)
    try {
      const { agent: data } = await api.agents.get(name)
      setAgent(data)
    } catch {
      // Agent not found
    } finally {
      setLoading(false)
    }
  }, [name])

  useEffect(() => {
    loadAgent()
  }, [loadAgent])

  const handleSave = async () => {
    if (!name) return
    setSaving(true)
    setMessage(null)
    try {
      const body: Record<string, string> = {}
      if (model) body.model = model
      if (permissionMode && permissionMode !== 'default') body.permissionMode = permissionMode
      await api.agents.update(name, body)
      setMessage('Saved successfully')
      await fetchAgents()
    } catch {
      setMessage('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!name) return
    try {
      await api.agents.delete(name)
      await fetchAgents()
      navigate('/agents')
    } catch {
      setMessage('Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Text size="sm" c="dimmed">
          Loading...
        </Text>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <Text size="sm" c="dimmed">
          Agent not found
        </Text>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <Tooltip label="Return to agents list" position="bottom" offset={6} openDelay={200}>
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate('/agents')}
          className="mb-4"
        >
          Back to agents
        </Button>
      </Tooltip>

      <Title order={2} className="mb-6">
        {agent.name}
      </Title>

      <Stack gap="lg">
        <Paper shadow="xs" p="md" radius="md">
          <Stack gap="sm">
            <Group gap="sm">
              <Text size="sm" fw={500} c="dimmed">
                Status
              </Text>
              <Badge variant="light" color={agent.status === 'active' ? 'green' : 'gray'} size="sm">
                {agent.status}
              </Badge>
            </Group>

            <Group gap="sm">
              <Text size="sm" fw={500} c="dimmed">
                Created
              </Text>
              <Text size="sm">{new Date(agent.createdAt).toLocaleString()}</Text>
            </Group>

            <Group gap="sm">
              <Text size="sm" fw={500} c="dimmed">
                Last Active
              </Text>
              <Text size="sm">{agent.lastActiveAt ? new Date(agent.lastActiveAt).toLocaleString() : 'Never'}</Text>
            </Group>
          </Stack>
        </Paper>

        <Divider />

        <Paper shadow="xs" p="md" radius="md">
          <Stack gap="md">
            <TextInput
              label="Model"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="e.g. claude-sonnet-4-20250514"
            />

            <Select
              label="Permission Mode"
              value={permissionMode}
              onChange={val => val && setPermissionMode(val)}
              data={[
                { value: 'default', label: 'Default' },
                { value: 'auto', label: 'Auto' },
                { value: 'manual', label: 'Manual' }
              ]}
            />
          </Stack>
        </Paper>

        {message && (
          <Text size="sm" c={message.includes('Failed') ? 'red' : 'green'}>
            {message}
          </Text>
        )}

        <Group justify="space-between" pt="xs">
          <Tooltip label="Permanently delete this agent" position="bottom" offset={6} openDelay={200}>
            <Button
              variant="subtle"
              color="red"
              leftSection={<Trash2 className="h-4 w-4" />}
              onClick={() => setDeleteOpen(true)}
            >
              Delete Agent
            </Button>
          </Tooltip>

          <Modal
            opened={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title={`Delete agent ${name}?`}
            centered
            withCloseButton={false}
          >
            <Text size="sm" c="dimmed">
              This action cannot be undone. This will permanently delete the agent and all its data.
            </Text>
            <Group justify="flex-end" mt="lg" gap="sm">
              <Button variant="subtle" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button color="red" onClick={handleDelete}>
                Delete
              </Button>
            </Group>
          </Modal>

          <Tooltip label="Save configuration changes" position="bottom" offset={6} openDelay={200}>
            <Button leftSection={<Save className="h-4 w-4" />} onClick={handleSave} disabled={saving} loading={saving}>
              Save Changes
            </Button>
          </Tooltip>
        </Group>
      </Stack>
    </div>
  )
}
