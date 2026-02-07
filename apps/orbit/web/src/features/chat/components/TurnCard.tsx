import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronRight, Loader2 } from 'lucide-react'
import { useState } from 'react'

import type { ToolEvent } from '@/stores/session.store'

function getToolBadgeClasses(name: string): string {
  switch (name) {
    case 'Read':
      return 'bg-blue-50 text-blue-600'
    case 'Write':
    case 'Edit':
      return 'bg-amber-50 text-amber-600'
    case 'Bash':
      return 'bg-emerald-50 text-emerald-600'
    case 'Grep':
    case 'Glob':
      return 'bg-violet-50 text-violet-600'
    default:
      return 'bg-surface-secondary text-text-secondary'
  }
}

function getPreviewText(event: ToolEvent): string | null {
  if (!event.input) return null
  const value = event.input.file_path || event.input.pattern || event.input.command
  if (typeof value === 'string') {
    return value.length > 60 ? `${value.slice(0, 60)}...` : value
  }
  return null
}

export function TurnCard({ events }: { events: ToolEvent[] }) {
  const [expanded, setExpanded] = useState(false)

  if (events.length === 0) return null

  const firstToolName = events[0]?.name

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-secondary/50"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <motion.span
          key={events.length}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-full bg-surface-secondary px-2 py-0.5 font-medium text-[11px] text-text-secondary"
        >
          {events.length} {events.length === 1 ? 'step' : 'steps'}
        </motion.span>
        {firstToolName && (
          <span className="truncate text-[12px] text-text-tertiary">
            {firstToolName}
            {events.length > 1 && `, ...`}
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-2 border-border-subtle border-l-2 py-1 pl-4">
              {events.map((event, index) => {
                const preview = getPreviewText(event)
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="flex items-center gap-2 py-1"
                  >
                    {event.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium text-[11px] ${getToolBadgeClasses(event.name)}`}
                    >
                      {event.name}
                    </span>
                    {preview && <span className="truncate text-[12px] text-text-tertiary">{preview}</span>}
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
