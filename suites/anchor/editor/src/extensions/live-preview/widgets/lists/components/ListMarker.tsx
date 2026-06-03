import h from 'solid-js/h'

import { listMarker } from './styles'

export function ListMarker() {
  return h('span', {
    'aria-hidden': 'true',
    class: listMarker(),
    'data-editor-role': 'list-marker'
  })
}
