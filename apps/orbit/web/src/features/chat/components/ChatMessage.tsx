import { motion } from 'framer-motion'
import { Copy, Eye } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Markdown } from '@/components/ui/Markdown'
import { StreamingMarkdown } from '@/components/ui/StreamingMarkdown'
import type { ChatMessage as ChatMessageType } from '@/lib/api'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const toggleRaw = useCallback(() => {
    setShowRaw(v => !v)
  }, [])

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex justify-end px-4 py-2"
      >
        <div className="max-w-[80%] rounded-2xl bg-accent-light/40 px-5 py-3.5">
          <p className="whitespace-pre-wrap text-[14px] text-text-primary leading-relaxed">{message.content}</p>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group px-4 py-2"
    >
      <div className="w-full">
        {showRaw ? (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-surface-secondary p-4 font-mono text-[13px] text-text-secondary">
            {message.content}
          </pre>
        ) : isStreaming ? (
          <StreamingMarkdown content={message.content} />
        ) : (
          <Markdown content={message.content} />
        )}
        <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={toggleRaw}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <Eye className="h-3.5 w-3.5" />
            {showRaw ? 'Rendered' : 'View raw'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
