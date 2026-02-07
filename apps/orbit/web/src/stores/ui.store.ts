import { create } from 'zustand'

export type View = 'chat' | 'inbox' | 'tasks' | 'agents' | 'agent-config'

interface UIState {
  view: View
  activeAgent: string | null
  activeSessionId: string | null
  sidebarCollapsed: boolean
  setView: (view: View) => void
  setActiveAgent: (name: string | null) => void
  setActiveSession: (id: string | null) => void
  toggleSidebar: () => void
}

export const useUIStore = create<UIState>(set => ({
  view: 'chat',
  activeAgent: null,
  activeSessionId: null,
  sidebarCollapsed: false,

  setView: view => set({ view }),
  setActiveAgent: name => set({ activeAgent: name }),
  setActiveSession: id => set({ activeSessionId: id }),
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed }))
}))
