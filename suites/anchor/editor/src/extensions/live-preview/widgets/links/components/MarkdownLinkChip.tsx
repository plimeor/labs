import h from 'solid-js/h'

import { markdownLinkChip } from './styles'

interface MarkdownLinkChipProps {
  label: string
  url: string
  onOpen: (event: MouseEvent) => void
}

export function MarkdownLinkChip(props: MarkdownLinkChipProps) {
  return h(
    'span',
    {
      class: markdownLinkChip(),
      'data-editor-role': 'markdown-link',
      'data-editor-url': props.url,
      'on:click': props.onOpen,
      title: props.url
    },
    props.label
  )
}
