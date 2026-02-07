import { Group, Text } from '@mantine/core'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot } from 'lucide-react'
import { useEffect, useState } from 'react'

const STATUS_MESSAGES = ['Thinking...', 'Processing...', 'Analyzing...', 'Reasoning...', 'Working on it...']

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function ProcessingIndicator() {
  const [messageIndex, setMessageIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % STATUS_MESSAGES.length)
    }, 8000)
    return () => clearInterval(timer)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-2.5 self-start"
    >
      {/* Avatar — matches assistant message */}
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-secondary">
        <Bot className="h-3.5 w-3.5 text-text-secondary" />
      </div>

      <div className="rounded-2xl rounded-tl-md border border-border-subtle bg-surface-elevated px-4 py-2.5 shadow-[var(--shadow-soft)]">
        <Group gap="sm">
          {/* Animated dots */}
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" style={{ animationDelay: '0ms' }} />
            <span
              className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent"
              style={{ animationDelay: '300ms' }}
            />
            <span
              className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent"
              style={{ animationDelay: '600ms' }}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.span
              key={messageIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
            >
              <Text size="sm" c="dimmed">
                {STATUS_MESSAGES[messageIndex]}
              </Text>
            </motion.span>
          </AnimatePresence>

          <Text size="xs" c="dimmed">
            &middot; {formatElapsed(elapsed)}
          </Text>
        </Group>
      </div>
    </motion.div>
  )
}
