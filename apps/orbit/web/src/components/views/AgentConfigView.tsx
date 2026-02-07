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
  const [permissionMode, setPermissionMode] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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
      if (permissionMode) body.permissionMode = permissionMode
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
    if (!window.confirm(`Delete agent "${name}"? This cannot be undone.`)) return
    try {
      await api.agents.delete(name)
      await fetchAgents()
      navigate('/agents')
    } catch {
      setMessage('Failed to delete')
    }
  }

  if (loading) {
    return <div className="flex h-full items-center justify-center text-text-secondary">Loading...</div>
  }

  if (!agent) {
    return <div className="flex h-full items-center justify-center text-text-secondary">Agent not found</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <button
        onClick={() => navigate('/agents')}
        className="mb-4 flex items-center gap-1 text-sm text-text-tertiary transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to agents
      </button>

      <h1 className="mb-6 font-semibold text-text-primary text-xl">{agent.name}</h1>

      <div className="space-y-6">
        <div>
          <label className="mb-1 block font-medium text-sm text-text-secondary">Status</label>
          <p className="text-sm text-text-secondary">{agent.status}</p>
        </div>

        <div>
          <label className="mb-1 block font-medium text-sm text-text-secondary">Created</label>
          <p className="text-sm text-text-secondary">{new Date(agent.createdAt).toLocaleString()}</p>
        </div>

        <div>
          <label className="mb-1 block font-medium text-sm text-text-secondary">Last Active</label>
          <p className="text-sm text-text-secondary">
            {agent.lastActiveAt ? new Date(agent.lastActiveAt).toLocaleString() : 'Never'}
          </p>
        </div>

        <hr className="border-border-subtle" />

        <div>
          <label className="mb-1 block font-medium text-sm text-text-secondary">Model</label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="e.g. claude-sonnet-4-20250514"
            className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <div>
          <label className="mb-1 block font-medium text-sm text-text-secondary">Permission Mode</label>
          <select
            value={permissionMode}
            onChange={e => setPermissionMode(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          >
            <option value="">Default</option>
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        {message && (
          <p className={`text-sm ${message.includes('Failed') ? 'text-status-error' : 'text-status-success'}`}>
            {message}
          </p>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-status-error transition-colors hover:bg-status-error/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete Agent
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 rounded-lg bg-accent px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
