import { createSignal, onCleanup } from 'solid-js'
import h from 'solid-js/h'

import { codeCopyButton } from './styles'

interface CodeCopyButtonProps {
  codeText: string
}

export function CodeCopyButton(props: CodeCopyButtonProps) {
  const [copied, setCopied] = createSignal(false)
  let timeout: ReturnType<typeof setTimeout> | undefined

  onCleanup(() => {
    if (timeout) clearTimeout(timeout)
  })

  const handleMouseDown = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (typeof navigator === 'undefined' || !navigator.clipboard) return

    void navigator.clipboard.writeText(props.codeText).then(() => {
      setCopied(true)
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => setCopied(false), 1500)
    })
  }

  return h(
    'button',
    {
      'aria-label': 'Copy code',
      class: () => codeCopyButton({ copied: copied() }),
      'data-editor-role': 'code-copy',
      'on:click': handleClick,
      'on:mousedown': handleMouseDown,
      title: 'Copy code',
      type: 'button'
    },
    () => (copied() ? 'Copied!' : 'Copy')
  )
}
