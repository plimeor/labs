/// <reference lib="dom" />

import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

import { codeBlockPlugin, codeBlockTheme } from '../../extensions/code-block'
import { livePreview, livePreviewTheme } from '../../extensions/live-preview'
import { anchorKeymap } from '../../keymap'

export interface EditorViewHarness {
  parent: HTMLElement
  view: EditorView
  cleanup(): void
  destroy(): void
  doc(): string
  contentText(): string
  lineText(lineNumber: number): string
  selection(): { from: number; to: number }
  moveCaret(pos: number | { line: number; column: number }): void
  selectRange(from: number, to: number): void
  dispatchText(from: number, to: number, insert: string): void
  typeText(text: string): Promise<void>
  pressKey(key: string): Promise<void>
  click(target: Element): Promise<void>
  mouseDown(target: Element): Promise<void>
  getByEditorRole(role: string, attrs?: Record<string, string>): HTMLElement
  queryByEditorRole(role: string, attrs?: Record<string, string>): HTMLElement | null
  allByEditorRole(role: string): HTMLElement[]
  clipboard: { writes: string[]; reset(): void }
  windowOpen: { calls: Array<[string, string?, string?]>; reset(): void }
  events(type: string): Event[]
  loadFixture(name: string): Promise<string>
  flush(): Promise<void>
  expectDocUnchanged(action: () => void | Promise<void>): Promise<void>
  expectEditorRole(role: string, attrs?: Record<string, string>): HTMLElement
}

interface CreateEditorHarnessOptions {
  cursorPos?: number
  doc: string
  extensions?: Extension[]
}

export function createEditorHarness(options: CreateEditorHarnessOptions): EditorViewHarness {
  const parent = document.createElement('div')
  document.body.appendChild(parent)

  const clipboardWrites: string[] = []
  const windowOpenCalls: Array<[string, string?, string?]> = []
  const eventLog: Event[] = []
  const originalClipboard = navigator.clipboard
  const originalOpen = window.open

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        clipboardWrites.push(text)
      }
    }
  })

  window.open = ((url?: string | URL, target?: string, features?: string) => {
    windowOpenCalls.push([String(url), target, features])
    return null
  }) as typeof window.open

  const events = new Map<string, Event[]>()
  const capture = (event: Event) => {
    const entries = events.get(event.type) ?? []
    entries.push(event)
    events.set(event.type, entries)
    eventLog.push(event)
  }

  parent.addEventListener('anchor:open-wikilink', capture)

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        markdown({ base: markdownLanguage }),
        anchorKeymap,
        livePreview,
        livePreviewTheme,
        codeBlockPlugin,
        codeBlockTheme,
        ...(options.extensions ?? [])
      ],
      selection: { anchor: options.cursorPos ?? 0 }
    })
  })

  const destroyView = view.destroy.bind(view)
  let cleaned = false

  function cleanup() {
    if (cleaned) return
    cleaned = true
    parent.removeEventListener('anchor:open-wikilink', capture)
    destroyView()
    parent.remove()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard
    })
    window.open = originalOpen
  }

  view.destroy = cleanup

  function roleSelector(role: string, attrs?: Record<string, string>): string {
    const escape = (value: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value)
    const attrSelector = Object.entries(attrs ?? {})
      .map(([key, value]) => `[${escape(key)}="${escape(value)}"]`)
      .join('')
    return `[data-editor-role="${escape(role)}"]${attrSelector}`
  }

  function position(pos: number | { line: number; column: number }): number {
    if (typeof pos === 'number') return pos
    const line = view.state.doc.line(pos.line)
    return Math.min(line.to, line.from + pos.column)
  }

  const harness: EditorViewHarness = {
    parent,
    view,
    cleanup,
    destroy: cleanup,
    doc: () => view.state.doc.toString(),
    contentText: () => view.dom.querySelector('.cm-content')?.textContent ?? '',
    lineText: lineNumber => view.state.doc.line(lineNumber).text,
    selection: () => {
      const { from, to } = view.state.selection.main
      return { from, to }
    },
    moveCaret: pos => {
      view.dispatch({ selection: { anchor: position(pos) } })
    },
    selectRange: (from, to) => {
      view.dispatch({ selection: EditorSelection.create([EditorSelection.range(from, to)]) })
    },
    dispatchText: (from, to, insert) => {
      view.dispatch({ changes: { from, to, insert } })
    },
    typeText: async text => {
      view.dispatch(view.state.replaceSelection(text))
    },
    pressKey: async key => {
      const event = new KeyboardEvent('keydown', { bubbles: true, key })
      view.contentDOM.dispatchEvent(event)
    },
    click: async target => {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    },
    mouseDown: async target => {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    },
    getByEditorRole: (role, attrs) => {
      const element = harness.queryByEditorRole(role, attrs)
      if (!element) throw new Error(`Missing editor role: ${role}`)
      return element
    },
    queryByEditorRole: (role, attrs) => view.dom.querySelector(roleSelector(role, attrs)),
    allByEditorRole: role => Array.from(view.dom.querySelectorAll(roleSelector(role))) as HTMLElement[],
    clipboard: {
      writes: clipboardWrites,
      reset: () => {
        clipboardWrites.length = 0
      }
    },
    windowOpen: {
      calls: windowOpenCalls,
      reset: () => {
        windowOpenCalls.length = 0
      }
    },
    events: type => events.get(type) ?? [],
    loadFixture: async name => {
      const text = await Bun.file(new URL(`../../__fixtures__/markdown/${name}.md`, import.meta.url)).text()
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length }
      })
      return text
    },
    flush: async () => {
      await Promise.resolve()
    },
    expectDocUnchanged: async action => {
      const before = harness.doc()
      await action()
      if (harness.doc() !== before) {
        throw new Error('Expected editor document to remain unchanged')
      }
    },
    expectEditorRole: (role, attrs) => harness.getByEditorRole(role, attrs)
  }

  void eventLog
  return harness
}
