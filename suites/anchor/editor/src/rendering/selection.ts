import type { EditorView } from '@codemirror/view'

export function overlapsSelection(view: EditorView, from: number, to: number): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true
  }
  return false
}

export function caretOnLine(view: EditorView, lineNumber: number): boolean {
  const { main } = view.state.selection
  return view.state.doc.lineAt(main.head).number === lineNumber
}
