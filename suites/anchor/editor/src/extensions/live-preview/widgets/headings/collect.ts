import { Decoration } from '@codemirror/view'

import { caretOnLine } from '../../../../rendering/selection'
import type { TreeEnterHandler } from '../../types'

const headingClasses: Record<string, string> = {
  ATXHeading1: 'text-[32px] font-bold leading-[1.2] text-[var(--text-heading)]',
  ATXHeading2: 'text-[27px] font-semibold leading-[1.4] text-[var(--text-heading)]',
  ATXHeading3: 'text-[20px] font-semibold leading-[1.4] text-[var(--text-heading)]',
  ATXHeading4: 'text-[20px] font-semibold leading-[1.4] text-[var(--text-heading)]',
  ATXHeading5: 'text-[16px] font-semibold text-[var(--text-heading)]',
  ATXHeading6: 'text-[14px] font-semibold text-[var(--text-heading)]'
}

export const collectHeading: TreeEnterHandler = (context, node) => {
  const headingClass = headingClasses[node.name]
  if (!headingClass) return

  const { collector, doc, view } = context
  const lineText = doc.sliceString(node.from, node.to)
  const markerMatch = lineText.match(/^(#{1,6}\s)/)
  if (!markerMatch) return

  const markerEnd = node.from + markerMatch[1].length
  const headingLine = doc.lineAt(node.from)

  if (!caretOnLine(view, headingLine.number)) {
    collector.replace(node.from, markerEnd, Decoration.replace({}), 5)
  }

  collector.mark(
    node.from,
    node.to,
    Decoration.mark({
      attributes: { 'data-editor-role': 'heading' },
      class: headingClass
    }),
    10
  )
}
