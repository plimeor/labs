import { ActionIcon, Group, Paper, Text } from '@mantine/core'
import { motion } from 'framer-motion'
import { Bot, Check, Copy, Eye, EyeOff, Maximize2, User } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { Markdown } from '@/components/ui/Markdown'
import { StreamingMarkdown } from '@/components/ui/StreamingMarkdown'
import type { ChatMessage as ChatMessageType } from '@/lib/api'
import type { ToolEvent } from '@/stores/session.store'

import { FullscreenOverlay } from './FullscreenOverlay'
import { TurnCard } from './TurnCard'

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
  toolEvents?: ToolEvent[]
}

export function ChatMessage({ message, isStreaming, toolEvents }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const toggleRaw = useCallback(() => {
    setShowRaw(v => !v)
  }, [])

  // User message bubble — right-aligned with avatar
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex max-w-[85%] items-end gap-2.5 self-end"
      >
        <div className="rounded-2xl rounded-br-sm border border-accent/15 bg-accent/15 px-4 py-2.5">
          <Text size="sm" className="whitespace-pre-wrap leading-relaxed">
            {message.content}
          </Text>
        </div>
        <div className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15">
          <User className="h-3.5 w-3.5 text-accent" />
        </div>
      </motion.div>
    )
  }

  // Assistant message card
  const hasToolEvents = toolEvents && toolEvents.length > 0
  const hasContent = message.content.length > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="group/card flex items-start gap-2.5 self-start"
    >
      {/* Avatar */}
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-secondary">
        <Bot className="h-3.5 w-3.5 text-text-secondary" />
      </div>

      {/* Message content column */}
      <div className="min-w-0 flex-1">
        {/* Tool events section */}
        {hasToolEvents && (
          <Paper shadow="xs" radius="md" px="md" py="sm" mb={8} className="bg-surface-elevated">
            <TurnCard events={toolEvents} />
          </Paper>
        )}

        {/* Response content */}
        {hasContent && (
          <div className="relative rounded-2xl rounded-tl-md border border-border-subtle bg-surface-elevated px-4 py-3 shadow-[var(--shadow-soft)]">
            <div ref={contentRef} className="overflow-y-auto">
              {showRaw ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-surface-secondary p-3 font-mono text-[13px] text-text-secondary">
                  {message.content}
                </pre>
              ) : isStreaming ? (
                <StreamingMarkdown content={message.content} />
              ) : (
                <Markdown content={message.content} />
              )}
            </div>

            {/* Hover action menu — top-right */}
            {!isStreaming && (
              <div className="pointer-events-none absolute -top-3 right-2 opacity-0 transition-opacity duration-150 group-hover/card:pointer-events-auto group-hover/card:opacity-100">
                <Paper shadow="md" radius="md" px={4} py={4} className="bg-surface-elevated">
                  <Group gap={2}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={handleCopy}
                      title={copied ? 'Copied' : 'Copy'}
                      aria-label={copied ? 'Copied' : 'Copy'}
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={toggleRaw}
                      title={showRaw ? 'Rendered view' : 'View as Markdown'}
                      aria-label={showRaw ? 'Rendered view' : 'View as Markdown'}
                    >
                      {showRaw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={() => setFullscreenOpen(true)}
                      title="Expand"
                      aria-label="Expand"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </ActionIcon>
                  </Group>
                </Paper>
              </div>
            )}
          </div>
        )}

        {/* Fullscreen overlay */}
        <FullscreenOverlay content={message.content} open={fullscreenOpen} onOpenChange={setFullscreenOpen} />
      </div>
    </motion.div>
  )
}
