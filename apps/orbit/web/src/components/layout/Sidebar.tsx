import { ActionIcon, Button, Divider, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Sun,
  Trash2,
  Users
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'

import type { Session } from '@/lib/api'
import { useTheme } from '@/shared/theme/ThemeProvider'
import { useAgentStore } from '@/stores/agent.store'
import { useSessionStore } from '@/stores/session.store'
import { useUIStore } from '@/stores/ui.store'

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const sidebarVariants = {
  expanded: {
    width: 256,
    transition: { type: 'spring', stiffness: 400, damping: 30 }
  },
  collapsed: {
    width: 52,
    transition: { type: 'spring', stiffness: 400, damping: 30 }
  }
}

const navContainerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } }
}

const navItemVariants = {
  hidden: { opacity: 0, x: -6 },
  show: { opacity: 1, x: 0, transition: { duration: 0.15 } }
}

const sessionItemVariants = {
  hidden: { opacity: 0, y: 4 },
  show: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -12, transition: { duration: 0.15 } }
}

const fadeVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.12 } }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    const date = new Date(session.lastMessageAt || session.createdAt)
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

function formatRelativeTime(dateStr: string): string {
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

// ---------------------------------------------------------------------------
// Nav items config
// ---------------------------------------------------------------------------

type NavTarget = 'chat' | 'inbox' | 'tasks' | 'agents'

interface NavItemConfig {
  id: NavTarget
  label: string
  icon: React.ReactNode
  matchViews: string[]
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageSquare className="h-4 w-4" />,
    matchViews: ['chat']
  },
  {
    id: 'inbox',
    label: 'Inbox',
    icon: <Inbox className="h-4 w-4" />,
    matchViews: ['inbox']
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: <Calendar className="h-4 w-4" />,
    matchViews: ['tasks']
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: <Users className="h-4 w-4" />,
    matchViews: ['agents', 'agent-config']
  }
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NavButton({
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
    <Button
      onClick={onClick}
      variant={active ? 'light' : 'subtle'}
      size="sm"
      fullWidth
      justify="start"
      leftSection={icon}
      color={active ? 'violet' : 'gray'}
    >
      {label}
    </Button>
  )
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete
}: {
  session: Session
  isActive: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const title = session.title || `Session ${session.id.slice(0, 8)}`

  return (
    <motion.div
      variants={sessionItemVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      layout
      className={[
        'group relative flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-[7px] transition-all duration-150',
        isActive
          ? 'bg-accent-light/80 font-medium text-text-primary'
          : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
      ].join(' ')}
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1">
        <Text size="sm" truncate fw={isActive ? 500 : 400} lh={1.4}>
          {title}
        </Text>
        <Text size="xs" c="dimmed" mt={2}>
          {formatRelativeTime(session.lastMessageAt || session.createdAt)}
          {' · '}
          {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
        </Text>
      </div>
      <ActionIcon
        onClick={onDelete}
        variant="subtle"
        size="xs"
        color="red"
        radius="sm"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        aria-label="Delete session"
      >
        <Trash2 className="h-3 w-3" />
      </ActionIcon>
    </motion.div>
  )
}

function DateGroupHeader({ label }: { label: string }) {
  return (
    <Text size="xs" c="dimmed" fw={500} tt="uppercase" lts="0.05em" px="xs" pt="sm" pb={4}>
      {label}
    </Text>
  )
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme()

  const cycleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
  }, [theme, setTheme])

  const icon =
    theme === 'light' ? (
      <Sun className="h-4 w-4" />
    ) : theme === 'dark' ? (
      <Moon className="h-4 w-4" />
    ) : (
      <Monitor className="h-4 w-4" />
    )

  const label = theme === 'light' ? 'Light mode' : theme === 'dark' ? 'Dark mode' : 'System theme'

  if (collapsed) {
    return (
      <Tooltip label={label} position="right" offset={8} openDelay={200}>
        <ActionIcon onClick={cycleTheme} variant="subtle" size="md" color="gray" aria-label={label}>
          {icon}
        </ActionIcon>
      </Tooltip>
    )
  }

  return (
    <Button
      onClick={cycleTheme}
      variant="subtle"
      size="sm"
      fullWidth
      justify="start"
      leftSection={icon}
      color="gray"
      aria-label={label}
    >
      {label}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Sidebar (main export)
// ---------------------------------------------------------------------------

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

  // Fetch agents once on mount
  const agentsFetched = useRef(false)
  useEffect(() => {
    if (!agentsFetched.current) {
      agentsFetched.current = true
      useAgentStore.getState().fetchAgents()
    }
  }, [])

  // Fetch sessions when agent changes
  const lastFetchedAgent = useRef<string | null>(null)
  useEffect(() => {
    if (currentAgent && currentAgent !== lastFetchedAgent.current) {
      lastFetchedAgent.current = currentAgent
      useSessionStore.getState().fetchSessions(currentAgent)
    }
  }, [currentAgent])

  const agentSessions = currentAgent ? sessions[currentAgent] || [] : []

  // Sort by lastMessageAt descending, then group by date
  const sortedSessions = useMemo(
    () =>
      [...agentSessions].sort(
        (a, b) =>
          new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime()
      ),
    [agentSessions]
  )
  const groupedSessions = useMemo(() => groupSessionsByDate(sortedSessions), [sortedSessions])

  // Navigation handlers
  const handleNavClick = useCallback(
    (target: NavTarget) => {
      useUIStore.getState().setView(target)
      switch (target) {
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
    },
    [currentAgent, navigate]
  )

  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      useUIStore.getState().setActiveSession(sessionId)
      if (currentAgent) {
        navigate(`/chat/${currentAgent}/${sessionId}`)
      }
    },
    [currentAgent, navigate]
  )

  const handleNewSession = useCallback(async () => {
    if (!currentAgent) return
    try {
      const session = await useSessionStore.getState().createSession(currentAgent)
      useUIStore.getState().setActiveSession(session.id)
      navigate(`/chat/${currentAgent}/${session.id}`)
    } catch {
      // Error handled in store
    }
  }, [currentAgent, navigate])

  const handleDeleteSession = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
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
    },
    [currentAgent, activeSessionId, navigate]
  )

  const resolvedActiveSessionId = params.sessionId || activeSessionId

  // -------------------------------------------------------------------------
  // Collapsed sidebar
  // -------------------------------------------------------------------------

  if (sidebarCollapsed) {
    return (
      <motion.div
        variants={sidebarVariants}
        initial={false}
        animate="collapsed"
        className="flex h-full flex-col items-center border-border-subtle border-r bg-surface-elevated py-3"
      >
        {/* Expand toggle */}
        <Tooltip label="Expand sidebar" position="right" offset={8} openDelay={200}>
          <ActionIcon
            onClick={toggleSidebar}
            variant="subtle"
            size="sm"
            color="gray"
            mb="sm"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </ActionIcon>
        </Tooltip>

        {/* Nav icons */}
        <Stack gap={4} align="center">
          {NAV_ITEMS.map(item => (
            <Tooltip key={item.id} label={item.label} position="right" offset={8} openDelay={200}>
              <ActionIcon
                onClick={() => handleNavClick(item.id)}
                variant={item.matchViews.includes(view) ? 'light' : 'subtle'}
                size="md"
                color={item.matchViews.includes(view) ? 'violet' : 'gray'}
                aria-label={item.label}
              >
                {item.icon}
              </ActionIcon>
            </Tooltip>
          ))}
        </Stack>

        {/* Spacer + theme toggle at bottom */}
        <div className="flex-1" />
        <ThemeToggle collapsed />
      </motion.div>
    )
  }

  // -------------------------------------------------------------------------
  // Expanded sidebar
  // -------------------------------------------------------------------------

  return (
    <motion.div
      variants={sidebarVariants}
      initial={false}
      animate="expanded"
      className="flex h-full flex-col overflow-hidden border-border-subtle border-r bg-surface-elevated"
    >
      {/* Header */}
      <Group justify="space-between" px="sm" py="sm" wrap="nowrap" className="shrink-0">
        <Group gap="xs" wrap="nowrap">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-light">
            <Bot className="h-4 w-4 text-accent" />
          </div>
          <Text fw={600} size="sm">
            Orbit
          </Text>
        </Group>
        <ActionIcon onClick={toggleSidebar} variant="subtle" size="sm" color="gray" aria-label="Collapse sidebar">
          <ChevronLeft className="h-4 w-4" />
        </ActionIcon>
      </Group>

      {/* Navigation */}
      <motion.nav className="shrink-0 px-2 pb-2" variants={navContainerVariants} initial="hidden" animate="show">
        <Stack gap={2}>
          {NAV_ITEMS.map(item => (
            <motion.div key={item.id} variants={navItemVariants}>
              <NavButton
                icon={item.icon}
                label={item.label}
                active={item.matchViews.includes(view)}
                onClick={() => handleNavClick(item.id)}
              />
            </motion.div>
          ))}
        </Stack>
      </motion.nav>

      <div className="px-3">
        <Divider />
      </div>

      {/* Sessions header */}
      <Group justify="space-between" px="md" pt="sm" pb={4} wrap="nowrap" className="shrink-0">
        <Text size="xs" c="dimmed" fw={500} tt="uppercase" lts="0.05em">
          Sessions
        </Text>
        <Tooltip label="New session" position="right" offset={8} openDelay={200}>
          <ActionIcon onClick={handleNewSession} variant="subtle" size="xs" color="violet" aria-label="New session">
            <Plus className="h-3.5 w-3.5" />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Session list */}
      <ScrollArea className="min-h-0 flex-1" scrollbarSize={6} type="hover">
        <div className="px-2 pb-2">
          {agentSessions.length === 0 ? (
            <motion.div variants={fadeVariants} initial="hidden" animate="show">
              <Text size="sm" c="dimmed" ta="center" py="md">
                No sessions yet
              </Text>
            </motion.div>
          ) : (
            <Stack gap={2}>
              <AnimatePresence mode="popLayout">
                {groupedSessions.map(group => (
                  <div key={group.label}>
                    <DateGroupHeader label={group.label} />
                    {group.sessions.map((session, index) => (
                      <motion.div key={session.id} transition={{ delay: index * 0.03 }}>
                        <SessionItem
                          session={session}
                          isActive={resolvedActiveSessionId === session.id}
                          onSelect={() => handleSessionSelect(session.id)}
                          onDelete={e => handleDeleteSession(e, session.id)}
                        />
                      </motion.div>
                    ))}
                  </div>
                ))}
              </AnimatePresence>
            </Stack>
          )}
        </div>
      </ScrollArea>

      {/* Bottom: separator + theme toggle */}
      <div className="shrink-0">
        <div className="px-3">
          <Divider />
        </div>
        <div className="px-2 py-2">
          <ThemeToggle collapsed={false} />
        </div>
      </div>
    </motion.div>
  )
}
