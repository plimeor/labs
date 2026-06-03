import type { SyntaxNodeRef, Tree } from '@lezer/common'
import type { Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

import type { DecorationCollector } from '../../rendering/decorations'

export interface CollectorContext {
  collector: DecorationCollector
  doc: Text
  tree: Tree
  view: EditorView
}

export type TreeEnterHandler = (context: CollectorContext, node: SyntaxNodeRef) => false | void
export type TreeLeaveHandler = (context: CollectorContext, node: SyntaxNodeRef) => void

export type SemanticToken =
  | {
      kind: 'tag'
      from: number
      to: number
      raw: string
      value: string
    }
  | {
      kind: 'markdown-link'
      from: number
      to: number
      label: string
      url: string
    }
  | {
      kind: 'wikilink'
      from: number
      to: number
      target: string
    }
  | {
      kind: 'task-checkbox'
      from: number
      to: number
      checked: boolean
    }
  | {
      kind: 'list-marker'
      from: number
      to: number
      raw: string
      markerKind: 'ordered' | 'unordered'
    }
