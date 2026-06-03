import { overlapsSelection } from '../../../../rendering/selection'
import type { CollectorContext } from '../../types'
import { tagDecoration } from './widgets'

export function collectTags(context: CollectorContext): void {
  for (const { from: visibleFrom, to: visibleTo } of context.view.visibleRanges) {
    const text = context.doc.sliceString(visibleFrom, visibleTo)
    const tagRe = /(?<![/\w#])#([\w][\w/-]*)/g
    let match: RegExpExecArray | null

    while ((match = tagRe.exec(text)) !== null) {
      const from = visibleFrom + match.index
      const to = from + match[0].length
      const nodeAtFrom = context.tree.resolveInner(from + 1, 1)

      if (nodeAtFrom.name === 'InlineCode' || nodeAtFrom.name === 'FencedCode' || nodeAtFrom.name === 'CodeBlock') {
        continue
      }

      if (!overlapsSelection(context.view, from, to)) {
        context.collector.replace(from, to, tagDecoration(match[0], match[1]), 7)
      }
    }
  }
}
