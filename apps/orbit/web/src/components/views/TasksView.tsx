import { Calendar, Pause, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import type { Task } from '@/lib/api'
import { api } from '@/lib/api'
import { useAgentStore } from '@/stores/agent.store'
import { useUIStore } from '@/stores/ui.store'

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
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

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-border-default border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-accent" />
          <h1 className="font-semibold text-lg text-text-primary">Tasks</h1>
          <span className="rounded-full bg-accent-light px-2 py-0.5 font-medium text-accent text-xs">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 font-medium text-sm text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            New Task
          </button>
          <button
            onClick={fetchTasks}
            disabled={loading}
            className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-3 inline-block rounded-2xl bg-accent-light p-4">
                <Calendar className="h-8 w-8 text-accent-muted" />
              </div>
              <p className="text-sm text-text-secondary">No scheduled tasks</p>
              <button
                onClick={() => setShowCreate(true)}
                className="mt-2 font-medium text-accent text-sm hover:text-accent-hover"
              >
                Create one
              </button>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-border-subtle border-b bg-surface-secondary/50 text-left font-medium text-text-tertiary text-xs uppercase tracking-wider">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Agent</th>
                <th className="px-3 py-3 font-medium">Schedule</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Last Run</th>
                <th className="px-3 py-3 font-medium">Next Run</th>
                <th className="px-3 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {tasks.map(task => (
                <tr key={task.id} className="transition-colors hover:bg-surface-secondary/40">
                  <td className="px-6 py-3">
                    <p className="font-medium text-sm text-text-primary">{task.name || task.prompt.slice(0, 40)}</p>
                    <p className="max-w-xs truncate text-text-tertiary text-xs">{task.prompt}</p>
                  </td>
                  <td className="px-3 py-3 text-sm text-text-secondary">{task.agentName}</td>
                  <td className="px-3 py-3 text-sm text-text-secondary">
                    <span className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-text-secondary text-xs">
                      {task.scheduleType}
                    </span>{' '}
                    {task.scheduleValue}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        task.status === 'active'
                          ? 'bg-status-success/10 text-status-success'
                          : 'bg-surface-secondary text-text-secondary'
                      }`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-text-tertiary text-xs">{formatDate(task.lastRun)}</td>
                  <td className="px-3 py-3 text-text-tertiary text-xs">{formatDate(task.nextRun)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggle(task)}
                        className="rounded p-1 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary"
                        title={task.status === 'active' ? 'Pause' : 'Resume'}
                      >
                        {task.status === 'active' ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(task)}
                        className="rounded p-1 text-text-tertiary transition-colors hover:bg-status-error/10 hover:text-status-error"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateTaskDialog
          agents={agents}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            fetchTasks()
          }}
        />
      )}
    </div>
  )
}

function CreateTaskDialog({
  agents,
  onClose,
  onCreated
}: {
  agents: { name: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [agentName, setAgentName] = useState(agents[0]?.name || '')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval' | 'once'>('interval')
  const [scheduleValue, setScheduleValue] = useState('1h')
  const [contextMode, setContextMode] = useState<'isolated' | 'main'>('isolated')
  const [submitting, setSubmitting] = useState(false)

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl bg-surface-elevated p-6 shadow-[var(--shadow-elevated)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg text-text-primary">Create Task</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block font-medium text-sm text-text-secondary">Agent</label>
            <select
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
            >
              {agents.map(a => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium text-sm text-text-secondary">Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              placeholder="My task"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-sm text-text-secondary">Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              placeholder="What should the agent do?"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block font-medium text-sm text-text-secondary">Schedule Type</label>
              <select
                value={scheduleType}
                onChange={e => setScheduleType(e.target.value as 'cron' | 'interval' | 'once')}
                className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              >
                <option value="interval">Interval</option>
                <option value="cron">Cron</option>
                <option value="once">Once</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-sm text-text-secondary">Schedule Value</label>
              <input
                type="text"
                value={scheduleValue}
                onChange={e => setScheduleValue(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                placeholder={scheduleType === 'cron' ? '*/5 * * * *' : '1h'}
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-medium text-sm text-text-secondary">Context Mode</label>
            <select
              value={contextMode}
              onChange={e => setContextMode(e.target.value as 'isolated' | 'main')}
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
            >
              <option value="isolated">Isolated</option>
              <option value="main">Main</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !prompt}
              className="rounded-lg bg-accent px-4 py-2 font-medium text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
