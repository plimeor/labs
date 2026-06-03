import type { SyntaxNodeRef } from '@lezer/common'

import { overlapsSelection } from '../../../../rendering/selection'
import type { CollectorContext } from '../../types'
import { markdownLinkDecoration, wikilinkDecoration } from './widgets'

interface MarkdownLinkState {
  inLink: boolean
  label: string
  url: string
}

export function createMarkdownLinkCollector() {
  const state: MarkdownLinkState = { inLink: false, label: '', url: '' }

  return {
    enter(context: CollectorContext, node: SyntaxNodeRef) {
      if (node.name === 'Link') {
        state.inLink = true
        state.label = ''
        state.url = ''
        return
      }

      if (state.inLink && node.name === 'URL') {
        state.url = context.doc.sliceString(node.from, node.to)
      }
    },

    leave(context: CollectorContext, node: SyntaxNodeRef) {
      if (node.name !== 'Link' || !state.inLink) return

      state.inLink = false

      const raw = context.doc.sliceString(node.from, node.to)
      const bracketClose = raw.indexOf('](')
      if (bracketClose > 0 && state.url) {
        state.label = raw.slice(1, bracketClose)
      }

      if (state.label && state.url && !overlapsSelection(context.view, node.from, node.to)) {
        context.collector.replace(node.from, node.to, markdownLinkDecoration(state.label, state.url), 5)
      }

      state.label = ''
      state.url = ''
    }
  }
}

export function collectWikilinks(context: CollectorContext): void {
  for (const { from: visibleFrom, to: visibleTo } of context.view.visibleRanges) {
    const text = context.doc.sliceString(visibleFrom, visibleTo)
    const wikilinkRe = /\[\[([^\]]+)\]\]/g
    let match: RegExpExecArray | null

    while ((match = wikilinkRe.exec(text)) !== null) {
      const from = visibleFrom + match.index
      const to = from + match[0].length
      const target = match[1]
      if (!overlapsSelection(context.view, from, to)) {
        context.collector.replace(from, to, wikilinkDecoration(target), 5)
      }
    }
  }
}
