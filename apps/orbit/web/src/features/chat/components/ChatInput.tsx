import { ActionIcon, Badge, Group, Textarea } from '@mantine/core'
import { motion } from 'framer-motion'
import { Send } from 'lucide-react'
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  agentName?: string
}

export function ChatInput({ onSend, disabled = false, placeholder = 'Type a message...', agentName }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus the textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSend = useCallback(() => {
    if (input.trim() && !disabled) {
      onSend(input.trim())
      setInput('')
    }
  }, [input, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const hasInput = input.trim().length > 0

  return (
    <div className="px-6 pt-3 pb-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border-subtle/50 bg-surface-elevated p-3 shadow-[var(--shadow-minimal)] transition-shadow focus-within:border-accent/30 focus-within:shadow-[var(--shadow-tinted)]">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autosize
          minRows={1}
          maxRows={6}
          variant="unstyled"
          size="sm"
          styles={{
            input: {
              padding: '4px'
            }
          }}
        />
        <Group mt={4} justify="space-between">
          <div>
            {agentName && (
              <Badge size="sm" variant="light" radius="md">
                {agentName}
              </Badge>
            )}
          </div>
          <motion.div whileTap={{ scale: 0.95 }}>
            <ActionIcon
              variant={hasInput ? 'filled' : 'default'}
              size="lg"
              radius="xl"
              onClick={handleSend}
              disabled={disabled || !hasInput}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </ActionIcon>
          </motion.div>
        </Group>
      </div>
    </div>
  )
}
