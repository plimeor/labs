import h from 'solid-js/h'

import { wikilinkChip } from './styles'

interface WikilinkChipProps {
  target: string
  onOpen: (event: MouseEvent) => void
}

export function WikilinkChip(props: WikilinkChipProps) {
  return h(
    'span',
    {
      class: wikilinkChip(),
      'data-editor-role': 'wikilink',
      'data-editor-target': props.target,
      'on:click': props.onOpen,
      title: `[[${props.target}]]`
    },
    props.target
  )
}
