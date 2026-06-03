import { wikilinkChip } from './styles'

interface WikilinkChipProps {
  target: string
  onOpen: (event: MouseEvent) => void
}

export function WikilinkChip(props: WikilinkChipProps): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = wikilinkChip()
  span.dataset.editorRole = 'wikilink'
  span.dataset.editorTarget = props.target
  span.title = `[[${props.target}]]`
  span.textContent = props.target
  span.addEventListener('click', props.onOpen)
  return span
}
