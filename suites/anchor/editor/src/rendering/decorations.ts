import { type Extension, RangeSetBuilder } from '@codemirror/state'
import type { Decoration, DecorationSet } from '@codemirror/view'

export interface PendingDeco {
  from: number
  to: number
  deco: Decoration
  priority: number
  isLine: boolean
  isReplace: boolean
}

export class DecorationCollector {
  readonly pending: PendingDeco[] = []

  replace(from: number, to: number, deco: Decoration, priority = 10): void {
    if (from > to) return
    if (from === to && !(deco.spec && 'widget' in deco.spec)) return
    this.pending.push({ from, to, deco, isLine: false, isReplace: true, priority })
  }

  mark(from: number, to: number, deco: Decoration, priority = 10): void {
    if (from >= to) return
    this.pending.push({ from, to, deco, isLine: false, isReplace: false, priority })
  }

  line(lineFrom: number, deco: Decoration): void {
    this.pending.push({ from: lineFrom, to: lineFrom, deco, isLine: true, isReplace: false, priority: 10 })
  }
}

export function decorationSetFrom(pending: PendingDeco[]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()

  pending.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from
    if (a.to !== b.to) return a.to - b.to
    return a.priority - b.priority
  })

  let lastReplaceEnd = -1

  for (const { from, to, deco, isLine, isReplace } of pending) {
    if (isLine) {
      builder.add(from, to, deco)
    } else if (isReplace) {
      if (from < lastReplaceEnd) continue
      builder.add(from, to, deco)
      if (to > lastReplaceEnd) lastReplaceEnd = to
    } else {
      builder.add(from, to, deco)
    }
  }

  return builder.finish()
}

export type EditorExtension = Extension
