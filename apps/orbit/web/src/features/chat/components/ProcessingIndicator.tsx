import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
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
    <div className="flex items-center gap-3 px-4 py-3">
      <Loader2 className="h-4 w-4 animate-spin text-accent" />
      <AnimatePresence mode="wait">
        <motion.span
          key={messageIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="text-sm text-text-secondary"
        >
          {STATUS_MESSAGES[messageIndex]}
        </motion.span>
      </AnimatePresence>
      <span className="text-[12px] text-text-tertiary">&middot; {formatElapsed(elapsed)}</span>
    </div>
  )
}
