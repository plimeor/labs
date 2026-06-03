import { codeCopyButton } from './styles'

interface CodeCopyButtonProps {
  codeText: string
}

export function CodeCopyButton(props: CodeCopyButtonProps): HTMLButtonElement {
  const button = document.createElement('button')
  let copied = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  const render = () => {
    button.className = codeCopyButton({ copied })
    button.textContent = copied ? 'Copied!' : 'Copy'
  }

  const handleMouseDown = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (typeof navigator === 'undefined' || !navigator.clipboard) return

    void navigator.clipboard.writeText(props.codeText).then(() => {
      copied = true
      render()
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(() => {
        copied = false
        render()
      }, 1500)
    })
  }

  button.setAttribute('aria-label', 'Copy code')
  button.dataset.editorRole = 'code-copy'
  button.title = 'Copy code'
  button.type = 'button'
  button.addEventListener('click', handleClick)
  button.addEventListener('mousedown', handleMouseDown)
  render()

  return button
}
