import { Button, Group, Modal } from '@mantine/core'
import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'

import { Markdown } from '@/components/ui/Markdown'

interface FullscreenOverlayProps {
  content: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FullscreenOverlay({ content, open, onOpenChange }: FullscreenOverlayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [content])

  return (
    <Modal opened={open} onClose={() => onOpenChange(false)} fullScreen title="Full Response">
      {/* Copy button */}
      <Group justify="flex-end" px="xl" py="xs">
        <Button
          variant="subtle"
          size="sm"
          onClick={handleCopy}
          leftSection={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </Group>

      {/* Content — free scroll */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl">
          <Markdown content={content} />
        </div>
      </div>
    </Modal>
  )
}
