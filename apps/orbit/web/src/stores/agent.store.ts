import { create } from 'zustand'

import type { Agent } from '@/lib/api'
import { api } from '@/lib/api'

interface AgentState {
  agents: Agent[]
  loading: boolean
  error: string | null
  fetchAgents: () => Promise<void>
  createAgent: (name: string, description?: string) => Promise<void>
  deleteAgent: (name: string) => Promise<void>
}

export const useAgentStore = create<AgentState>(set => ({
  agents: [],
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null })
    try {
      const { agents } = await api.agents.list()
      set({ agents, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch agents',
        loading: false
      })
    }
  },

  createAgent: async (name, description) => {
    try {
      await api.agents.create(name, description)
      const { agents } = await api.agents.list()
      set({ agents })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create agent'
      })
    }
  },

  deleteAgent: async name => {
    try {
      await api.agents.delete(name)
      set(s => ({ agents: s.agents.filter(a => a.name !== name) }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete agent'
      })
    }
  }
}))
