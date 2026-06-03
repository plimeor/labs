import { Decoration } from '@codemirror/view'

import { overlapsSelection } from '../../../../rendering/selection'
import type { TreeEnterHandler } from '../../types'

const boldMark = Decoration.mark({
  attributes: { 'data-editor-role': 'strong' },
  class: 'font-bold text-[var(--text-primary)]'
})

const italicMark = Decoration.mark({
  attributes: { 'data-editor-role': 'emphasis' },
  class: 'italic text-[var(--text-primary)]'
})

const inlineCodeMark = Decoration.mark({
  attributes: { 'data-editor-role': 'inline-code' },
  class:
    'rounded bg-[var(--code-inline-bg)] px-1 py-0.5 text-[0.85em] text-[var(--code-inline-text)] [font-family:var(--font-mono)]'
})

export const collectInlineFormat: TreeEnterHandler = (context, node) => {
  const { collector, view } = context

  if (node.name === 'StrongEmphasis') {
    collector.mark(node.from, node.to, boldMark, 10)
    if (!overlapsSelection(view, node.from, node.to)) {
      collector.replace(node.from, node.from + 2, Decoration.replace({}), 5)
      collector.replace(node.to - 2, node.to, Decoration.replace({}), 5)
    }
    return
  }

  if (node.name === 'Emphasis') {
    collector.mark(node.from, node.to, italicMark, 10)
    if (!overlapsSelection(view, node.from, node.to)) {
      collector.replace(node.from, node.from + 1, Decoration.replace({}), 5)
      collector.replace(node.to - 1, node.to, Decoration.replace({}), 5)
    }
    return
  }

  if (node.name === 'InlineCode') {
    collector.mark(node.from, node.to, inlineCodeMark, 10)
    if (!overlapsSelection(view, node.from, node.to)) {
      collector.replace(node.from, node.from + 1, Decoration.replace({}), 5)
      collector.replace(node.to - 1, node.to, Decoration.replace({}), 5)
    }
  }
}
