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

  // biome-ignore lint/correctness/useExhaustiveDependencies: input triggers resize recalculation
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

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
    <div className="px-4 pt-2 pb-4">
      <div className="mx-auto max-w-3xl rounded-2xl bg-surface-elevated p-3 shadow-[var(--shadow-middle)]">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent px-1 py-1 text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          style={{ minHeight: '36px', maxHeight: '200px' }}
        />
        <div className="mt-1 flex items-center justify-between">
          <div>
            {agentName && (
              <span className="rounded-lg bg-accent-light px-2 py-0.5 font-medium text-[12px] text-accent">
                {agentName}
              </span>
            )}
          </div>
          <motion.button
            onClick={handleSend}
            disabled={disabled || !hasInput}
            whileTap={{ scale: 0.95 }}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed ${
              hasInput ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface-secondary text-text-tertiary'
            }`}
          >
            <Send className="h-4 w-4" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}
