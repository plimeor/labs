import type { Text } from '@codemirror/state'

import { overlapsSelection } from '../../../../rendering/selection'
import type { CollectorContext, TreeEnterHandler } from '../../types'
import { listMarkerDecoration, taskCheckboxDecoration } from './widgets'

export const collectTaskCheckbox: TreeEnterHandler = (context, node) => {
  if (node.name !== 'TaskMarker') return
  if (overlapsSelection(context.view, node.from, node.to)) return

  const text = context.doc.sliceString(node.from, node.to)
  const checked = text === '[x]' || text === '[X]'
  context.collector.replace(node.from, node.to, taskCheckboxDecoration(checked, node.from), 5)
}

export function collectListMarkers(context: CollectorContext): void {
  const { doc } = context

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
    const line = doc.line(lineNumber)
    collectMarkerForLine(context, doc, line.from, line.text)
  }
}

function collectMarkerForLine(context: CollectorContext, doc: Text, lineFrom: number, text: string): void {
  const unordered = text.match(/^(\s*)([-*])\s+/)
  if (unordered) {
    const markerStart = lineFrom + unordered[1].length
    const markerEnd = markerStart + unordered[2].length
    const rest = text.slice(unordered[0].length)
    if (/^\[[ xX]\]\s+/.test(rest)) return
    if (!overlapsSelection(context.view, markerStart, markerEnd)) {
      context.collector.replace(markerStart, markerEnd, listMarkerDecoration(), 6)
    }
    return
  }

  const ordered = text.match(/^(\s*)(\d+\.)\s+/)
  if (ordered) {
    const markerStart = lineFrom + ordered[1].length
    const markerEnd = markerStart + ordered[2].length
    if (!overlapsSelection(context.view, markerStart, markerEnd)) {
      context.collector.replace(markerStart, markerEnd, listMarkerDecoration(), 6)
    }
  }

  void doc
}
