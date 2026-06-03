import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useRef, useState } from 'react'

import type { AutosaveResult, SaveStatus } from '../autosave-controller'
import { AutosaveController } from '../autosave-controller'
import { codeBlockPlugin, codeBlockTheme } from '../extensions/code-block'
import { livePreview, livePreviewTheme } from '../extensions/live-preview'
import { anchorKeymap } from '../keymap'
import { EditorStatus } from './EditorStatus'

interface EditorProps {
  baseRevision: string
  body: string
  noteId: string
  onAutosave: (body: string, baseRevision: string) => Promise<AutosaveResult>
  onDirtyChange?: (dirty: boolean) => void
  onOpenWikilink?: (target: string) => Promise<void> | void
}

function codeColor(name: string): string {
  if (typeof document === 'undefined') return 'inherit'
  return getComputedStyle(document.documentElement).getPropertyValue(`--syntax-code-${name}`).trim() || 'inherit'
}

function buildCodeHighlightStyle(): HighlightStyle {
  return HighlightStyle.define([
    {
      color: codeColor('keyword'),
      tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword, tags.definitionKeyword]
    },
    { color: codeColor('string'), tag: [tags.string, tags.special(tags.string)] },
    { color: codeColor('comment'), fontStyle: 'italic', tag: [tags.comment, tags.lineComment, tags.blockComment] },
    { color: codeColor('number'), tag: [tags.number, tags.integer, tags.float, tags.literal, tags.bool, tags.atom] },
    { color: codeColor('function'), tag: [tags.typeName, tags.className, tags.namespace] },
    {
      color: codeColor('number'),
      tag: [tags.propertyName, tags.attributeName, tags.url, tags.special(tags.variableName)]
    },
    {
      color: codeColor('type'),
      tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator, tags.bitwiseOperator]
    },
    { color: codeColor('comment'), tag: [tags.meta, tags.invalid] },
    { color: codeColor('deletion'), tag: [tags.deleted] },
    { color: codeColor('addition'), tag: [tags.inserted] }
  ])
}

function codeHighlightExtension() {
  return syntaxHighlighting(buildCodeHighlightStyle())
}

const baseEditorTheme = EditorView.theme({
  '.cm-cursor': { borderLeftColor: 'var(--caret-color)' },
  '.cm-selectionBackground': { background: 'var(--selection-bg)' },
  '&': { caretColor: 'var(--caret-color)' },
  '&.cm-focused .cm-selectionBackground': { background: 'var(--selection-bg)' }
})

export function Editor(props: EditorProps) {
  const [status, setStatus] = useState<SaveStatus>('starting')

  const containerRef = useRef<HTMLDivElement>(null)
  const activeNoteIdRef = useRef(props.noteId)
  const controllerRef = useRef<AutosaveController | null>(null)
  const themeCompartmentRef = useRef<Compartment | null>(null)
  const themeObserverRef = useRef<MutationObserver | null>(null)
  const viewRef = useRef<EditorView | null>(null)

  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const reconfigureCodeHighlight = () => {
      const view = viewRef.current
      const themeCompartment = themeCompartmentRef.current
      if (!view || !themeCompartment) return
      view.dispatch({ effects: themeCompartment.reconfigure(codeHighlightExtension()) })
    }

    const syntaxThemeCompartment = new Compartment()
    themeCompartmentRef.current = syntaxThemeCompartment
    const initialText = normalizeCrlf(propsRef.current.body)
    const handleOpenWikilink = (event: Event) => {
      const target = (event as CustomEvent<{ target: string }>).detail?.target
      if (!target) return

      const result = propsRef.current.onOpenWikilink?.(target)
      if (result instanceof Promise) {
        result.catch(() => {})
      }
    }

    const controller = new AutosaveController(initialText, propsRef.current.baseRevision, {
      onStatusChange: setStatus,
      getCurrentText: () => viewRef.current?.state.doc.toString() ?? '',
      onDirtyChange: dirty => propsRef.current.onDirtyChange?.(dirty),
      onDocReplace: newBody => {
        const view = viewRef.current
        if (!view) return
        const current = view.state.doc.toString()
        if (current !== newBody) {
          view.dispatch({
            changes: { from: 0, insert: normalizeCrlf(newBody), to: current.length }
          })
        }
      },
      onSave: (body, rev) => propsRef.current.onAutosave(body, rev)
    })
    controllerRef.current = controller

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialText,
        extensions: [
          history(),
          keymap.of([
            {
              key: 'Mod-s',
              run() {
                void controllerRef.current?.flush()
                return true
              }
            },
            ...defaultKeymap,
            ...historyKeymap
          ]),
          EditorView.lineWrapping,
          anchorKeymap,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxThemeCompartment.of(codeHighlightExtension()),
          baseEditorTheme,
          livePreview,
          livePreviewTheme,
          codeBlockPlugin,
          codeBlockTheme,
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              controllerRef.current?.onChange(update.state.doc.toString())
            }
          })
        ]
      })
    })
    viewRef.current = view
    container.addEventListener('anchor:open-wikilink', handleOpenWikilink)
    activeNoteIdRef.current = propsRef.current.noteId
    controller.load(initialText, propsRef.current.baseRevision)

    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      const themeObserver = new MutationObserver(reconfigureCodeHighlight)
      themeObserverRef.current = themeObserver
      themeObserver.observe(document.documentElement, {
        attributeFilter: ['data-theme', 'style'],
        attributes: true
      })
    }

    return () => {
      container.removeEventListener('anchor:open-wikilink', handleOpenWikilink)
      controllerRef.current?.destroy()
      themeObserverRef.current?.disconnect()
      viewRef.current?.destroy()
      controllerRef.current = null
      themeCompartmentRef.current = null
      themeObserverRef.current = null
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const noteId = props.noteId
    const body = props.body
    const baseRevision = props.baseRevision

    const view = viewRef.current
    const controller = controllerRef.current
    if (!view || !controller) return

    const noteChanged = noteId !== activeNoteIdRef.current

    if (noteChanged) {
      activeNoteIdRef.current = noteId
      const nextText = normalizeCrlf(body)
      resetViewDocument(view, nextText)
      controller.load(nextText, baseRevision)
      return
    }

    if (baseRevision !== controller.baseRevision) {
      const currentText = view.state.doc.toString()
      const incomingText = normalizeCrlf(body)
      if (currentText === incomingText || currentText === controller.lastSavedText) {
        resetViewDocument(view, incomingText)
        controller.load(incomingText, baseRevision)
      }
    }
  }, [props.noteId, props.body, props.baseRevision])

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="markdown-editor">
      <EditorStatus status={status} />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          aria-label="Note editor"
          aria-multiline="true"
          className="editor-surface cm-editor-mount"
          data-testid="live-preview-surface"
          role="textbox"
        />
      </div>
    </section>
  )
}

function normalizeCrlf(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

function resetViewDocument(view: EditorView, newText: string): void {
  const current = view.state.doc.toString()
  if (current === newText) return
  view.dispatch({
    changes: { from: 0, insert: newText, to: current.length }
  })
}
