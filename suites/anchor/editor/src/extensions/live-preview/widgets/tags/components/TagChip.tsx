import { tagChip } from './styles'

interface TagChipProps {
  raw: string
  value: string
}

export function TagChip(props: TagChipProps): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = tagChip()
  span.dataset.editorRole = 'tag'
  span.dataset.editorTag = props.value
  span.dataset.editorTagRaw = props.raw
  span.textContent = props.raw
  return span
}
