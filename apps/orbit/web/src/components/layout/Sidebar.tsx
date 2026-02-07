import { motion } from 'framer-motion'
import { Bot, Calendar, ChevronLeft, ChevronRight, Inbox, MessageSquare, Plus, Trash2, Users } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'

import type { Session } from '@/lib/api'
import { useAgentStore } from '@/stores/agent.store'
import { useSessionStore } from '@/stores/session.store'
import { useUIStore } from '@/stores/ui.store'

const navContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } }
}

const navItemVariants = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0 }
}

function groupSessionsByDate(sessions: Session[]): { label: string; sessions: Session[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000)

  const groups: Record<string, Session[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: []
  }

  for (const session of sessions) {
    const date = new Date(session.lastMessageAt)
    const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    if (sessionDay.getTime() === today.getTime()) {
      groups.Today.push(session)
    } else if (sessionDay.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(session)
    } else if (sessionDay.getTime() >= weekStart.getTime()) {
      groups['This Week'].push(session)
    } else {
      groups.Earlier.push(session)
    }
  }

  return ['Today', 'Yesterday', 'This Week', 'Earlier']
    .filter(label => groups[label].length > 0)
    .map(label => ({ label, sessions: groups[label] }))
}

export function Sidebar() {
  const navigate = useNavigate()
  const params = useParams<{ agentName?: string; sessionId?: string }>()

  const view = useUIStore(s => s.view)
  const activeAgent = useUIStore(s => s.activeAgent)
  const activeSessionId = useUIStore(s => s.activeSessionId)
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed)
  const toggleSidebar = useUIStore(s => s.toggleSidebar)
  const agents = useAgentStore(s => s.agents)
  const sessions = useSessionStore(s => s.sessions)

  const currentAgent = params.agentName || activeAgent || agents[0]?.name || null

  const agentsFetched = useRef(false)
  useEffect(() => {
    if (!agentsFetched.current) {
      agentsFetched.current = true
      useAgentStore.getState().fetchAgents()
    }
  }, [])

  const lastFetchedAgent = useRef<string | null>(null)
  useEffect(() => {
    if (currentAgent && currentAgent !== lastFetchedAgent.current) {
      lastFetchedAgent.current = currentAgent
      useSessionStore.getState().fetchSessions(currentAgent)
    }
  }, [currentAgent])

  const agentSessions = currentAgent ? sessions[currentAgent] || [] : []

  const handleNavClick = (targetView: 'chat' | 'inbox' | 'tasks' | 'agents') => {
    useUIStore.getState().setView(targetView)
    switch (targetView) {
      case 'chat':
        navigate(currentAgent ? `/chat/${currentAgent}` : '/')
        break
      case 'inbox':
        navigate('/inbox')
        break
      case 'tasks':
        navigate('/tasks')
        break
      case 'agents':
        navigate('/agents')
        break
    }
  }

  const handleSessionSelect = (sessionId: string) => {
    useUIStore.getState().setActiveSession(sessionId)
    if (currentAgent) {
      navigate(`/chat/${currentAgent}/${sessionId}`)
    }
  }

  const handleNewSession = async () => {
    if (!currentAgent) return
    try {
      const session = await useSessionStore.getState().createSession(currentAgent)
      useUIStore.getState().setActiveSession(session.id)
      navigate(`/chat/${currentAgent}/${session.id}`)
    } catch {
      // Error handled in store
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation()
    if (!currentAgent) return
    try {
      await useSessionStore.getState().deleteSession(currentAgent, sessionId)
      if (activeSessionId === sessionId) {
        useUIStore.getState().setActiveSession(null)
        navigate(`/chat/${currentAgent}`)
      }
    } catch {
      // Error handled in store
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d`
  }

  const sortedSessions = [...agentSessions].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  )
  const groupedSessions = groupSessionsByDate(sortedSessions)

  if (sidebarCollapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-border-default border-r bg-surface-secondary py-3">
        <button
          onClick={toggleSidebar}
          className="mb-4 rounded-lg p-1 text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleNavClick('chat')}
          className={`mb-2 rounded-lg p-2 transition-colors ${view === 'chat' ? 'bg-accent-light text-accent' : 'text-text-tertiary hover:bg-surface-elevated'}`}
        >
          <MessageSquare className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleNavClick('inbox')}
          className={`mb-2 rounded-lg p-2 transition-colors ${view === 'inbox' ? 'bg-accent-light text-accent' : 'text-text-tertiary hover:bg-surface-elevated'}`}
        >
          <Inbox className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleNavClick('tasks')}
          className={`mb-2 rounded-lg p-2 transition-colors ${view === 'tasks' ? 'bg-accent-light text-accent' : 'text-text-tertiary hover:bg-surface-elevated'}`}
        >
          <Calendar className="h-4 w-4" />
        </button>
        <button
          onClick={() => handleNavClick('agents')}
          className={`rounded-lg p-2 transition-colors ${view === 'agents' || view === 'agent-config' ? 'bg-accent-light text-accent' : 'text-text-tertiary hover:bg-surface-elevated'}`}
        >
          <Users className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full w-64 flex-col bg-surface-elevated shadow-[var(--shadow-middle)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 shadow-[0_1px_0_var(--color-border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-light">
            <Bot className="h-4 w-4 text-accent" />
          </div>
          <span className="font-semibold text-sm text-text-primary">Orbit</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="rounded-lg p-1 text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <motion.nav
        className="space-y-0.5 border-border-subtle border-b px-2 py-2"
        variants={navContainerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={navItemVariants}>
          <NavItem
            icon={<MessageSquare className="h-4 w-4" />}
            label="Chat"
            active={view === 'chat'}
            onClick={() => handleNavClick('chat')}
          />
        </motion.div>
        <motion.div variants={navItemVariants}>
          <NavItem
            icon={<Inbox className="h-4 w-4" />}
            label="Inbox"
            active={view === 'inbox'}
            onClick={() => handleNavClick('inbox')}
          />
        </motion.div>
        <motion.div variants={navItemVariants}>
          <NavItem
            icon={<Calendar className="h-4 w-4" />}
            label="Tasks"
            active={view === 'tasks'}
            onClick={() => handleNavClick('tasks')}
          />
        </motion.div>
        <motion.div variants={navItemVariants}>
          <NavItem
            icon={<Users className="h-4 w-4" />}
            label="Agents"
            active={view === 'agents' || view === 'agent-config'}
            onClick={() => handleNavClick('agents')}
          />
        </motion.div>
      </motion.nav>

      {/* Sessions */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="mb-1.5 flex items-center justify-between px-2">
          <p className="font-medium text-[11px] text-text-tertiary uppercase tracking-wider">Sessions</p>
          <button
            onClick={handleNewSession}
            className="rounded-lg p-0.5 text-text-tertiary transition-colors hover:bg-accent-light hover:text-accent"
            title="New session"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {agentSessions.length === 0 ? (
          <p className="px-2 py-2 text-text-tertiary text-xs">No sessions yet</p>
        ) : (
          <div className="space-y-0.5">
            {groupedSessions.map(group => (
              <div key={group.label}>
                <p className="px-2 pt-3 pb-1 font-medium text-[11px] text-text-tertiary uppercase tracking-wider">
                  {group.label}
                </p>
                {group.sessions.map(session => {
                  const isActive = (params.sessionId || activeSessionId) === session.id
                  return (
                    <div
                      key={session.id}
                      onClick={() => handleSessionSelect(session.id)}
                      className={`group flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 transition-all duration-150 ${
                        isActive
                          ? 'border-accent border-l-2 bg-accent-light text-text-primary shadow-[var(--shadow-minimal)]'
                          : 'text-text-secondary hover:bg-surface-elevated hover:shadow-[var(--shadow-minimal)]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px]">{session.title || `Session ${session.id.slice(0, 8)}`}</p>
                        <p className="text-[11px] text-text-tertiary">
                          <span className="font-medium text-text-tertiary">{currentAgent}</span>
                          {' \u00b7 '}
                          {formatTime(session.lastMessageAt)} \u00b7 {session.messageCount} msgs
                        </p>
                      </div>
                      <button
                        onClick={e => handleDeleteSession(e, session.id)}
                        className="hidden rounded-lg p-0.5 text-text-tertiary transition-colors hover:bg-accent-muted hover:text-status-error group-hover:block"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NavItem({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
        active ? 'bg-accent-light font-medium text-accent' : 'text-text-secondary hover:bg-accent-light/50'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
