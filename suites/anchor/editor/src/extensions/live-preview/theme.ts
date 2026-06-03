import { EditorView } from '@codemirror/view'

export const livePreviewTheme = EditorView.theme({
  '.cm-cursor': { borderLeftColor: 'var(--caret-color)' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-selectionBackground': { background: 'var(--selection-bg)' },

  '&.cm-editor.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground': { background: 'var(--selection-bg)' },

  '.cm-content': {
    caretColor: 'var(--caret-color)',
    fontFamily: 'var(--font-sans)',
    lineHeight: '1.5'
  },

  '&': {
    fontFamily: "'Inter Variable', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: '15px',
    height: '100%'
  }
})
