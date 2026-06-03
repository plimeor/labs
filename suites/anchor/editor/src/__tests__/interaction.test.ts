/**
 * Interaction tests for the CM6 Anchor keymap.
 *
 * We directly invoke the command functions (bypassing DOM event dispatch
 * which is unreliable in happy-dom). This is the correct approach for
 * CM6 command testing: a Command is just (view: EditorView) => boolean.
 *
 * Mirrors the behaviour proven in src/editor/__tests__/editor-input.integration.test.ts.
 */

/// <reference lib="dom" />

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

import { codeFenceInputHandler, handleEnterCommand, handleShiftTabCommand, handleTabCommand } from '../keymap'

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' })
})

afterAll(() => {
  GlobalRegistrator.unregister()
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeView(doc: string, cursorPos?: number): EditorView {
  const parent = document.createElement('div')
  document.body.appendChild(parent)

  const pos = cursorPos ?? doc.length
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
    selection: { anchor: pos }
  })

  return new EditorView({ state, parent })
}

function setCursorToEnd(view: EditorView): void {
  view.dispatch({ selection: { anchor: view.state.doc.length } })
}

function setCursorAfter(view: EditorView, text: string): void {
  const doc = view.state.doc.toString()
  const idx = doc.indexOf(text)
  if (idx === -1) throw new Error(`Text not found: "${text}"`)
  view.dispatch({ selection: { anchor: idx + text.length } })
}

function typeText(view: EditorView, text: string): void {
  view.dispatch(view.state.replaceSelection(text))
}

function getDoc(view: EditorView): string {
  return view.state.doc.toString()
}

// ---------------------------------------------------------------------------
// Enter continuation — bullet list
// ---------------------------------------------------------------------------

describe('Enter continues bullet list', () => {
  test('- item\\n[enter] produces new - prefix', () => {
    const view = makeView('- item')
    setCursorToEnd(view)

    const handled = handleEnterCommand(view)
    expect(handled).toBe(true)

    const doc = getDoc(view)
    expect(doc).toContain('- item')
    expect(doc).toContain('\n- ')
    view.destroy()
  })

  test('- item1\\n[enter] then type -> - item1\\n- item2', () => {
    const view = makeView('- item1')
    setCursorToEnd(view)

    handleEnterCommand(view)
    typeText(view, 'item2')

    expect(getDoc(view)).toBe('- item1\n- item2')
    view.destroy()
  })

  test('empty bullet item [enter] exits the list', () => {
    // `- ` with nothing after cursor — should exit (remove the prefix)
    const view = makeView('- first\n- ')
    setCursorToEnd(view)

    const handled = handleEnterCommand(view)
    expect(handled).toBe(true)

    const doc = getDoc(view)
    expect(doc).toContain('- first')
    // The empty `- ` prefix should be gone
    expect(doc).not.toMatch(/- \n/)
    view.destroy()
  })

  test('* item uses * marker on continuation', () => {
    const view = makeView('* item')
    setCursorToEnd(view)

    handleEnterCommand(view)
    typeText(view, 'next')

    expect(getDoc(view)).toBe('* item\n* next')
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Enter continuation — ordered list
// ---------------------------------------------------------------------------

describe('Enter continues ordered list', () => {
  test('1. a\\n[enter] creates 2. prefix', () => {
    const view = makeView('1. a')
    setCursorToEnd(view)

    const handled = handleEnterCommand(view)
    expect(handled).toBe(true)

    typeText(view, 'b')
    expect(getDoc(view)).toBe('1. a\n2. b')
    view.destroy()
  })

  test('ordered list increments from 3 to 4', () => {
    const view = makeView('1. a\n2. b\n3. c')
    setCursorToEnd(view)

    handleEnterCommand(view)
    typeText(view, 'd')
    expect(getDoc(view)).toBe('1. a\n2. b\n3. c\n4. d')
    view.destroy()
  })

  test('empty ordered item [enter] exits', () => {
    const view = makeView('1. first\n2. ')
    setCursorToEnd(view)

    const handled = handleEnterCommand(view)
    expect(handled).toBe(true)

    const doc = getDoc(view)
    expect(doc).toContain('1. first')
    expect(doc).not.toContain('3. ')
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Enter continuation — blockquote
// ---------------------------------------------------------------------------

describe('Enter continues blockquote', () => {
  test('> hello\\n[enter] continues the quote', () => {
    const view = makeView('> hello')
    setCursorToEnd(view)

    const handled = handleEnterCommand(view)
    expect(handled).toBe(true)

    typeText(view, 'world')
    const doc = getDoc(view)
    expect(doc).toContain('> hello')
    expect(doc).toContain('> world')
    view.destroy()
  })

  test('empty quote line [enter] exits the quote', () => {
    const view = makeView('> q\n> ')
    setCursorToEnd(view)

    const handled = handleEnterCommand(view)
    expect(handled).toBe(true)

    const doc = getDoc(view)
    expect(doc).toContain('> q')
    // The empty `> ` line should be removed
    const lines = doc.split('\n')
    expect(lines.some(l => l === '> ')).toBe(false)
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Task list
// ---------------------------------------------------------------------------

describe('Task list', () => {
  test('- [ ] item\\n[enter] creates new plain bullet (not task)', () => {
    // Design choice: task continuation produces `- ` not `- [ ] `
    // because the user should explicitly add the `[ ]` to create a task.
    const view = makeView('- [ ] todo')
    setCursorToEnd(view)

    const handled = handleEnterCommand(view)
    expect(handled).toBe(true)

    typeText(view, 'more')
    const doc = getDoc(view)
    expect(doc).toContain('- [ ] todo')
    // New item is a plain bullet (no task marker)
    expect(doc).toContain('\n- more')
    view.destroy()
  })

  test('empty task item [enter] exits the list', () => {
    const view = makeView('- [ ] done\n- [ ] ')
    setCursorToEnd(view)

    const handled = handleEnterCommand(view)
    expect(handled).toBe(true)

    const doc = getDoc(view)
    expect(doc).toContain('- [ ] done')
    // The empty task prefix should be removed
    expect(doc.trim().endsWith('done')).toBe(true)
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tab / Shift-Tab
// ---------------------------------------------------------------------------

describe('Tab / Shift-Tab list indent/outdent', () => {
  test('Tab on a bullet item adds 2 spaces of indent', () => {
    const view = makeView('- parent\n- child')
    setCursorAfter(view, '- child')

    const handled = handleTabCommand(view)
    expect(handled).toBe(true)

    const doc = getDoc(view)
    expect(doc).toContain('  - child')
    view.destroy()
  })

  test('Shift-Tab on an indented bullet removes 2 spaces', () => {
    const view = makeView('- parent\n  - child')
    setCursorAfter(view, '  - child')

    const handled = handleShiftTabCommand(view)
    expect(handled).toBe(true)

    const doc = getDoc(view)
    expect(doc).toContain('\n- child')
    view.destroy()
  })

  test('Shift-Tab with no indent does not change doc', () => {
    const view = makeView('- only')
    setCursorToEnd(view)

    const handled = handleShiftTabCommand(view)
    expect(handled).toBe(false)

    expect(getDoc(view)).toBe('- only')
    view.destroy()
  })

  test('Tab on non-list line does nothing', () => {
    const view = makeView('plain text')
    setCursorToEnd(view)

    const handled = handleTabCommand(view)
    expect(handled).toBe(false)

    expect(getDoc(view)).toBe('plain text')
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Code fence auto-pair (item 3)
//
// We test by calling codeFenceInputHandler(view, from, to, text) directly.
// This is the canonical CM6 approach: inputHandler.of only fires via the DOM
// input event, so unit tests call the raw handler function.
// ---------------------------------------------------------------------------

describe('Code fence auto-pair', () => {
  test('calling handler with 3rd backtick on a line of ```` auto-pairs', () => {
    // Doc is `` with cursor at position 2 (end of the two backticks)
    const view = makeView('``', 2)

    const handled = codeFenceInputHandler(view, 2, 2, '`')
    expect(handled).toBe(true)

    const doc = getDoc(view)
    // Should be: ```\n\n``` with cursor on the blank middle line
    expect(doc).toBe('```\n\n```')
    // Caret should be on the blank line (position 4 = after "```\n")
    expect(view.state.selection.main.anchor).toBe(4)
    view.destroy()
  })

  test('handler returns false for a non-backtick character', () => {
    const view = makeView('``', 2)
    const handled = codeFenceInputHandler(view, 2, 2, 'x')
    expect(handled).toBe(false)
    // Doc should be unchanged
    expect(getDoc(view)).toBe('``')
    view.destroy()
  })

  test('handler returns false when only one backtick precedes (not 3rd)', () => {
    const view = makeView('`', 1)
    const handled = codeFenceInputHandler(view, 1, 1, '`')
    expect(handled).toBe(false)
    view.destroy()
  })

  test('handler returns false when a closing fence already exists below', () => {
    // The doc already has a closing fence on a later line
    const doc = '``\n\n```\n'
    const view = makeView(doc, 2)

    const handled = codeFenceInputHandler(view, 2, 2, '`')
    expect(handled).toBe(false)
    view.destroy()
  })

  test('auto-paired doc has opening and closing fence lines', () => {
    const view = makeView('``', 2)
    codeFenceInputHandler(view, 2, 2, '`')

    const lines = getDoc(view).split('\n')
    const fenceLines = lines.filter(l => l === '```')
    expect(fenceLines.length).toBe(2)
    view.destroy()
  })

  test('handler does not mutate doc — only dispatches a transaction', () => {
    const view = makeView('``', 2)
    // Before: doc is ``
    expect(getDoc(view)).toBe('``')
    // After auto-pair, doc changes via a proper dispatch (not in-place mutation)
    codeFenceInputHandler(view, 2, 2, '`')
    // Doc is now the auto-paired version — verify it is the expected value
    expect(getDoc(view)).toBe('```\n\n```')
    view.destroy()
  })
})
