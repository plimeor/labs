import { Decoration } from '@codemirror/view'

import { overlapsSelection } from '../../../../rendering/selection'
import type { TreeEnterHandler } from '../../types'

const blockquoteLine = Decoration.line({
  attributes: { 'data-editor-role': 'blockquote-line' },
  class: 'block border-l-[3px] border-[var(--blockquote-border)] pl-4 italic text-[var(--blockquote-text)]'
})

export const collectBlockquote: TreeEnterHandler = (context, node) => {
  const { collector, doc, view } = context

  if (node.name === 'Blockquote') {
    const startLine = doc.lineAt(node.from)
    const endLine = doc.lineAt(node.to - 1 < node.from ? node.from : node.to - 1)
    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber++) {
      collector.line(doc.line(lineNumber).from, blockquoteLine)
    }
    return
  }

  if (node.name === 'QuoteMark') {
    let markerEnd = node.to
    if (markerEnd < doc.length && doc.sliceString(markerEnd, markerEnd + 1) === ' ') {
      markerEnd += 1
    }
    if (!overlapsSelection(view, node.from, markerEnd)) {
      collector.replace(node.from, markerEnd, Decoration.replace({}), 5)
    }
  }
}
