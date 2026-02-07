import { Bot, Plus, RefreshCw, X } from 'lucide-react'
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
      <div className="flex items-center justify-between border-border-default border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-accent" />
          <h1 className="font-semibold text-lg text-text-primary">Agents</h1>
          <span className="rounded-full bg-accent-light px-2 py-0.5 font-medium text-accent text-xs">
            {agents.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 font-medium text-sm text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            New Agent
          </button>
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {agents.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-3 inline-block rounded-2xl bg-accent-light p-4">
                <Bot className="h-8 w-8 text-accent-muted" />
              </div>
              <p className="text-sm text-text-secondary">No agents configured</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-2 font-medium text-accent text-sm hover:text-accent-hover"
              >
                Create one
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {agents.map(agent => (
              <div
                key={agent.name}
                onClick={() => handleAgentClick(agent.name)}
                className="cursor-pointer rounded-xl border border-border-default bg-surface-elevated p-4 transition-all hover:border-border-default/70 hover:shadow-[var(--shadow-card)]"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-light">
                    <Bot className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-medium text-text-primary">{agent.name}</h3>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          agent.status === 'active' ? 'bg-status-success' : 'bg-border-default'
                        }`}
                      />
                      <span className="text-text-tertiary text-xs">{agent.status}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-1 text-text-tertiary text-xs">
                  <p>Created: {formatDate(agent.createdAt)}</p>
                  <p>Last active: {formatDate(agent.lastActiveAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-surface-elevated p-6 shadow-[var(--shadow-elevated)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-lg text-text-primary">Create Agent</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block font-medium text-sm text-text-secondary">Agent Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  placeholder="e.g. researcher"
                  required
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="rounded-lg bg-accent px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
