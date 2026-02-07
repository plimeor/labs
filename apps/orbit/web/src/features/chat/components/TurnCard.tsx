import { Badge, Collapse, Group, Text, UnstyledButton } from '@mantine/core'
import { motion } from 'framer-motion'
import { CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { useState } from 'react'

import type { ToolEvent } from '@/stores/session.store'

function getToolBadgeColor(name: string): string {
  switch (name) {
    case 'Read':
      return 'blue'
    case 'Write':
    case 'Edit':
    case 'NotebookEdit':
      return 'yellow'
    case 'Bash':
      return 'green'
    case 'Grep':
    case 'Glob':
      return 'violet'
    case 'WebFetch':
    case 'WebSearch':
      return 'cyan'
    default:
      return 'gray'
  }
}

function getPreviewText(event: ToolEvent): string | null {
  if (!event.input) return null
  const value = event.input.file_path || event.input.pattern || event.input.command || event.input.query
  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 80)}...` : value
  }
  return null
}

interface TurnCardProps {
  events: ToolEvent[]
}

export function TurnCard({ events }: TurnCardProps) {
  const [open, setOpen] = useState(false)

  if (events.length === 0) return null

  const completedCount = events.filter(e => e.status === 'complete').length
  const allComplete = completedCount === events.length
  const hasRunning = events.some(e => e.status === 'running')

  const label = allComplete
    ? `${events.length} ${events.length === 1 ? 'Step' : 'Steps'} Completed`
    : `${completedCount}/${events.length} ${events.length === 1 ? 'Step' : 'Steps'}`

  return (
    <div className="mb-3">
      <UnstyledButton
        onClick={() => setOpen(o => !o)}
        className="w-full rounded-lg px-3 py-2 transition-colors hover:bg-surface-secondary/60"
      >
        <Group gap="xs">
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          />

          {hasRunning ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success" />
          )}

          <motion.span key={events.length} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <Text size="sm" fw={500} c="dimmed">
              {label}
            </Text>
          </motion.span>
        </Group>
      </UnstyledButton>

      <Collapse in={open} transitionDuration={200}>
        <div className="ml-3 border-border-subtle border-l-2 py-1 pl-4">
          {events.map((event, index) => {
            const preview = getPreviewText(event)
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.15 }}
              >
                <Group gap="xs" py={6} wrap="nowrap">
                  {event.status === 'running' ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-success" />
                  )}
                  <Badge size="xs" variant="light" color={getToolBadgeColor(event.name)} radius="sm">
                    {event.name}
                  </Badge>
                  {preview && (
                    <Text size="xs" c="dimmed" ff="monospace" truncate className="min-w-0">
                      {preview}
                    </Text>
                  )}
                </Group>
              </motion.div>
            )
          })}
        </div>
      </Collapse>
    </div>
  )
}
