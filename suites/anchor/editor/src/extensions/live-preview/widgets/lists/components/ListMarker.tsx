import { listMarker } from './styles'

export function ListMarker(): HTMLSpanElement {
  const span = document.createElement('span')
  span.setAttribute('aria-hidden', 'true')
  span.className = listMarker()
  span.dataset.editorRole = 'list-marker'
  return span
}
