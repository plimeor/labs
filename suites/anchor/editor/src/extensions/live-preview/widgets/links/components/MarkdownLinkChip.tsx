import { markdownLinkChip } from './styles'

interface MarkdownLinkChipProps {
  label: string
  url: string
  onOpen: (event: MouseEvent) => void
}

export function MarkdownLinkChip(props: MarkdownLinkChipProps): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = markdownLinkChip()
  span.dataset.editorRole = 'markdown-link'
  span.dataset.editorUrl = props.url
  span.title = props.url
  span.textContent = props.label
  span.addEventListener('click', props.onOpen)
  return span
}
