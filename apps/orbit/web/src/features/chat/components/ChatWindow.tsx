import { ActionIcon, Button, Group, Paper, ScrollArea, Text } from '@mantine/core'
import { motion } from 'framer-motion'
import { Bot, Square } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { ToolEvent } from '@/stores/session.store'

import { useChat } from '../hooks/useChat'
import { ChatInput } from './ChatInput'
import { ChatMessage } from './ChatMessage'
import { ProcessingIndicator } from './ProcessingIndicator'
import { TurnCard } from './TurnCard'

interface ChatWindowProps {
  agentName: string
}

/**
 * Pairs tool events with the last assistant message in the list.
 * During streaming, tool events that haven't been "claimed" by a finished
 * assistant message are shown inside the streaming card or as a standalone
 * TurnCard above the processing indicator.
 */
function useToolEventPairing(
  messages: { role: string; content: string }[],
  toolEvents: ToolEvent[],
  isStreaming: boolean,
  streaming: string | null
) {
  return useMemo(() => {
    if (toolEvents.length === 0) {
      return { pairedEvents: new Map<number, ToolEvent[]>(), pendingEvents: [] as ToolEvent[] }
    }

    // Find the last assistant message index
    let lastAssistantIdx = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        lastAssistantIdx = i
        break
      }
    }

    const pairedEvents = new Map<number, ToolEvent[]>()

    // If we are currently streaming (streaming text is being appended as a virtual
    // assistant message at the end), those tool events belong to that streaming
    // message. Otherwise, pair them with the last finished assistant message.
    if (isStreaming && streaming !== null && lastAssistantIdx >= 0) {
      // The streaming message is appended as the last item in `messages` by useChat
      pairedEvents.set(lastAssistantIdx, toolEvents)
      return { pairedEvents, pendingEvents: [] as ToolEvent[] }
    }

    if (lastAssistantIdx >= 0) {
      pairedEvents.set(lastAssistantIdx, toolEvents)
      return { pairedEvents, pendingEvents: [] as ToolEvent[] }
    }

    // No assistant message yet — show as pending (standalone)
    return { pairedEvents, pendingEvents: toolEvents }
  }, [messages, toolEvents, isStreaming, streaming])
}

export function ChatWindow({ agentName }: ChatWindowProps) {
  const { messages, streaming, isStreaming, toolEvents, error, send, abort, clearError } = useChat(agentName)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const { pairedEvents, pendingEvents } = useToolEventPairing(messages, toolEvents, isStreaming, streaming)

  const showProcessing = isStreaming && !streaming
  const isNearBottomRef = useRef(true)

  const handleScroll = useCallback((_pos: { x: number; y: number }) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const threshold = 100
    isNearBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < threshold
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages and streaming updates
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streaming])

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Messages area */}
      <ScrollArea
        className="chat-scroll-area flex-1 overflow-hidden"
        scrollbarSize={8}
        type="hover"
        viewportRef={viewportRef}
        onScrollPositionChange={handleScroll}
      >
        <div className="flex min-h-full w-full flex-1 flex-col">
          {messages.length === 0 && !showProcessing && pendingEvents.length === 0 ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="text-center"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-light shadow-[var(--shadow-tinted)]">
                  <Bot className="h-5 w-5 text-accent" />
                </div>
                <Text size="md" fw={600}>
                  Start a conversation
                </Text>
                <Text size="sm" c="dimmed" mt={6}>
                  Send a message to begin chatting with <span className="font-medium text-accent">{agentName}</span>
                </Text>
                <Group gap="xs" mt="md" justify="center">
                  {['What can you do?', 'Help me debug', 'Write some code'].map(prompt => (
                    <Button key={prompt} variant="default" size="xs" radius="xl" onClick={() => send(prompt)}>
                      {prompt}
                    </Button>
                  ))}
                </Group>
              </motion.div>
            </div>
          ) : (
            <div className="mx-auto mt-auto flex max-w-4xl flex-col gap-5 px-6 pt-8 pb-6">
              {messages.map((message, index) => (
                <ChatMessage
                  key={`${message.role}-${index}`}
                  message={message}
                  isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
                  toolEvents={pairedEvents.get(index)}
                />
              ))}

              {/* Pending tool events (no assistant message yet, e.g. tools running before first text) */}
              {pendingEvents.length > 0 && (
                <Paper shadow="sm" radius="md" px="md" py="sm">
                  <TurnCard events={pendingEvents} />
                </Paper>
              )}

              {showProcessing && <ProcessingIndicator />}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Error */}
      {error && (
        <Group justify="space-between" className="border-status-error/20 border-t bg-status-error/5" px="md" py="xs">
          <Text size="sm" c="red">
            {error}
          </Text>
          <Button variant="subtle" color="red" size="xs" onClick={clearError}>
            Dismiss
          </Button>
        </Group>
      )}

      {/* Abort / Input */}
      <div className="relative">
        {isStreaming && (
          <Group justify="center" py="xs">
            <Button
              variant="light"
              color="red"
              size="xs"
              radius="xl"
              leftSection={<Square className="h-3 w-3" />}
              onClick={abort}
            >
              Stop generating
            </Button>
          </Group>
        )}
        <ChatInput onSend={send} disabled={isStreaming} agentName={agentName} />
      </div>
    </div>
  )
}
