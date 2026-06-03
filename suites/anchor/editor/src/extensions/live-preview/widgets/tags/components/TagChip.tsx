import h from 'solid-js/h'

import { tagChip } from './styles'

interface TagChipProps {
  raw: string
  value: string
}

export function TagChip(props: TagChipProps) {
  return h(
    'span',
    {
      class: tagChip(),
      'data-editor-role': 'tag',
      'data-editor-tag': props.value,
      'data-editor-tag-raw': props.raw
    },
    props.raw
  )
}
