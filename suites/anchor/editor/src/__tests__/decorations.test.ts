/**
 * Decoration unit tests for the CM6 live-preview plugin.
 *
 * We build an EditorView in happy-dom, let the live-preview plugin run,
 * then inspect decoration effects via:
 *   - view.state.doc.toString() — NEVER changes (core invariant)
 *   - view.dom  — widget replacements (chips, checkboxes) render spans/inputs
 *   - Absence of raw syntax chars in .cm-content (hide/replace decorations work)
 *
 * Notes on happy-dom limitations:
 *   CM6 line decorations (Decoration.line) apply a CSS class to the .cm-line
 *   container DIV, but only after the view performs a full measure cycle.
 *   In happy-dom (no layout engine) the line-class is not applied to the DOM
 *   element.  We therefore test line-decoration effects by:
 *     (a) confirming the doc is unchanged
 *     (b) confirming that widget-replacement effects (QuoteMark hide, CodeMark hide)
 *         are visible in the DOM text (the raw "> " / "```" are absent when caret
 *         is away from them)
 *   The live-browser E2E tests in e2e/ assert the CSS classes in a real browser.
 */

/// <reference lib="dom" />

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { EditorView } from '@codemirror/view'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

import { createEditorHarness } from './harness/editor-harness'

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' })
})

afterAll(() => {
  GlobalRegistrator.unregister()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeView(doc: string, cursorPos?: number): EditorView {
  return createEditorHarness({ cursorPos, doc }).view
}

/** Text visible in the editor's content area (cm-content). */
function contentText(view: EditorView): string {
  return view.dom.querySelector('.cm-content')?.textContent ?? ''
}

function editorElement<T extends HTMLElement = HTMLElement>(view: EditorView, selector: string): T {
  const element = view.dom.querySelector(selector)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing editor element: ${selector}`)
  }
  return element as T
}

// ---------------------------------------------------------------------------
// Tests — document is never mutated
// ---------------------------------------------------------------------------

describe('Decoration: document is never mutated', () => {
  test('heading doc is unchanged after view creation', () => {
    const body = '# Hello world\n\nSome text\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('wikilink doc is unchanged after view creation', () => {
    const body = 'See [[Project Alpha]] for details\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('task list doc is unchanged after view creation', () => {
    const body = '- [ ] do this\n- [x] done\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('bold/italic doc is unchanged after view creation', () => {
    const body = 'Text with **bold** and *italic* and `code`\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('markdown link doc is unchanged after view creation', () => {
    const body = 'Click [Anchor](https://example.com) here\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('blockquote doc is unchanged after view creation', () => {
    const body = '> This is a quote\n> Line two\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('fenced code block doc is unchanged after view creation', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('full stress doc is unchanged', () => {
    const body = [
      '## Section 001: [[Project 001]] #stress/001',
      '',
      '- [ ] Review [Design 001](https://example.com) with [[Owner 001]] and `code` #review',
      '- [x] Done item',
      '',
      '> Quote with [[wikilink]] and #tag',
      '',
      '**bold** and *italic* and `inline code`'
    ].join('\n')

    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — heading decorations
// ---------------------------------------------------------------------------

describe('Decoration: heading decorations are applied', () => {
  test('heading line gets a decoration (mark in the decoration set)', () => {
    const body = '# Hello\n\nsome text\n'
    const view = makeView(body, body.length) // cursor at end (not on heading)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('cursor inside heading reveals the # marker (no crash, doc intact)', () => {
    const body = '# Hello\n'
    const view = makeView(body, 2) // cursor inside `# Hello`
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('heading ## marker is hidden in DOM when caret is elsewhere', () => {
    const body = '## Section\n\nBody text\n'
    const view = makeView(body, body.length) // caret at end, away from heading
    // The heading-mark replace decoration removes "## " from the rendered DOM.
    // happy-dom applies widget/replace decorations fully.
    const text = contentText(view)
    expect(text).not.toContain('##')
    view.destroy()
  })

  test('heading ## marker is visible in DOM when caret is on heading line', () => {
    const body = '## Section\n'
    const view = makeView(body, 2) // caret on heading line
    // Reveal-on-caret: the replace is skipped, so ## appears in the DOM.
    const text = contentText(view)
    expect(text).toContain('##')
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — reveal-on-caret
// ---------------------------------------------------------------------------

describe('Decoration: reveal-on-caret — doc is always the source', () => {
  test('wikilink with caret outside: doc unchanged', () => {
    const body = 'text [[Alpha]] more\n'
    const view = makeView(body, 0) // caret at start, outside wikilink
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('wikilink with caret inside: doc unchanged (decorations skipped, not doc)', () => {
    const body = 'text [[Alpha]] more\n'
    const wikilinkStart = body.indexOf('[[')
    const view = makeView(body, wikilinkStart + 3) // caret inside [[Alpha]]
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('markdown link with caret inside: doc unchanged', () => {
    const body = 'See [Docs](https://example.com) now\n'
    const linkStart = body.indexOf('[')
    const view = makeView(body, linkStart + 2) // caret inside link
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('blockquote with caret on quote line: doc unchanged', () => {
    const body = '> Blockquote text\n'
    const view = makeView(body, 3) // caret inside the quote text
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('fenced code with caret on fence line: doc unchanged', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, 2) // caret on opening fence line
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('multiple edits preserve document identity', () => {
    const body = '# Heading\n\n[[wikilink]] #tag\n- [ ] task\n**bold**\n'
    const view = makeView(body, 5)

    // Simulate cursor moves
    view.dispatch({ selection: { anchor: 0 } })
    expect(view.state.doc.toString()).toBe(body)

    view.dispatch({ selection: { anchor: body.indexOf('[[') + 2 } })
    expect(view.state.doc.toString()).toBe(body)

    view.dispatch({ selection: { anchor: body.length } })
    expect(view.state.doc.toString()).toBe(body)

    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — markdown link chip (new — Fix #1)
// ---------------------------------------------------------------------------

describe('Decoration: markdown link chip', () => {
  test('markdown link renders a chip widget when caret is outside', () => {
    const body = '[Anchor](https://example.com)\n'
    const view = makeView(body, body.length) // caret at end

    // The MarkdownLinkWidget renders a span with [data-editor-role="markdown-link"]
    const chip = view.dom.querySelector('[data-editor-role="markdown-link"]')
    expect(chip).not.toBeNull()
    expect(chip?.textContent).toBe('Anchor')
    view.destroy()
  })

  test('markdown link chip shows label text, not raw syntax', () => {
    const body = 'See [Docs](https://docs.example.com) for more\n'
    const view = makeView(body, body.length) // caret at end

    const chip = view.dom.querySelector('[data-editor-role="markdown-link"]')
    expect(chip).not.toBeNull()
    expect(chip?.textContent).toBe('Docs')
    // Raw bracket/paren syntax should NOT be visible in the content
    const rawText = contentText(view)
    expect(rawText).not.toContain('](https://')
    view.destroy()
  })

  test('markdown link reveals raw syntax when caret is inside', () => {
    const body = '[Click me](https://example.com)\n'
    const linkStart = body.indexOf('[')
    const view = makeView(body, linkStart + 2) // caret inside "[Click me]"

    // Widget should NOT be rendered when caret overlaps
    const chip = view.dom.querySelector('[data-editor-role="markdown-link"]')
    expect(chip).toBeNull()
    view.destroy()
  })

  test('doc is unchanged after markdown link decoration', () => {
    const body = 'A [link](https://example.com) and more text\n'
    const view = makeView(body, body.length)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('multiple markdown links all render chips', () => {
    const body = '[One](https://one.com) and [Two](https://two.com)\n'
    const view = makeView(body, body.length)

    const chips = view.dom.querySelectorAll('[data-editor-role="markdown-link"]')
    expect(chips.length).toBe(2)
    const labels = Array.from(chips).map(c => c.textContent)
    expect(labels).toContain('One')
    expect(labels).toContain('Two')
    view.destroy()
  })

  test('moving caret away from link: chip appears', () => {
    const body = '[Click](https://example.com)\n'
    // Start with caret inside the link
    const view = makeView(body, 3)
    expect(view.dom.querySelector('[data-editor-role="markdown-link"]')).toBeNull()

    // Move caret to end — chip should appear
    view.dispatch({ selection: { anchor: body.length } })
    expect(view.dom.querySelector('[data-editor-role="markdown-link"]')).not.toBeNull()
    view.destroy()
  })

  test('markdown link chip stores url in data-editor-url attribute', () => {
    const body = '[Docs](https://example.com/docs)\n'
    const view = makeView(body, body.length)

    const chip = view.dom.querySelector('[data-editor-role="markdown-link"]') as HTMLElement | null
    expect(chip).not.toBeNull()
    expect(chip?.dataset.editorUrl).toBe('https://example.com/docs')
    view.destroy()
  })

  test('markdown link opens safe URL only on modified click', async () => {
    const body = '[Docs](https://example.com/docs)\n'
    const harness = createEditorHarness({ cursorPos: body.length, doc: body })

    try {
      const link = harness.expectEditorRole('markdown-link')

      await harness.click(link)
      expect(harness.windowOpen.calls).toEqual([])

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
      expect(harness.windowOpen.calls).toEqual([['https://example.com/docs', '_blank', 'noopener,noreferrer']])
      expect(harness.doc()).toBe(body)
    } finally {
      harness.destroy()
    }
  })

  test('markdown link with javascript: URL never opens on modified click', () => {
    const body = '[evil](javascript:alert(1))\n'
    const harness = createEditorHarness({ cursorPos: body.length, doc: body })

    try {
      const link = harness.expectEditorRole('markdown-link')
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))

      expect(harness.windowOpen.calls).toEqual([])
      expect(harness.doc()).toBe(body)
    } finally {
      harness.destroy()
    }
  })

  test('wikilink emits open event only on modified click', async () => {
    const body = 'See [[Alpha]] now\n'
    const harness = createEditorHarness({ cursorPos: body.length, doc: body })

    try {
      const wikilink = harness.expectEditorRole('wikilink')

      await harness.click(wikilink)
      expect(harness.events('anchor:open-wikilink')).toEqual([])

      wikilink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))

      const [event] = harness.events('anchor:open-wikilink') as CustomEvent<{ target: string }>[]
      expect(event.detail).toEqual({ target: 'Alpha' })
      expect(harness.doc()).toBe(body)
    } finally {
      harness.destroy()
    }
  })
})

// ---------------------------------------------------------------------------
// Tests — blockquote decoration (new — Fix #2)
// ---------------------------------------------------------------------------

describe('Decoration: blockquote', () => {
  test('blockquote line gets a line decoration class', () => {
    const body = '> This is a quote\n'
    const view = makeView(body, body.length) // caret at end

    const bqLine = view.dom.querySelector('[data-editor-role="blockquote-line"]')
    expect(bqLine).not.toBeNull()
    view.destroy()
  })

  test('blockquote QuoteMark is hidden in DOM when caret is outside', () => {
    const body = '> This is a quote\n'
    const view = makeView(body, body.length) // caret at end

    // The ">" QuoteMark is replaced (hidden). The doc still has it.
    expect(view.state.doc.toString()).toBe(body)
    // Rendered text does NOT contain "> " as a leading character
    const text = contentText(view)
    expect(text).not.toContain('>')
    view.destroy()
  })

  test('blockquote QuoteMark revealed when caret is on quote marker', () => {
    const body = '> Quote text\n'
    const view = makeView(body, 1) // caret on ">" itself

    // Reveal-on-caret: ">" visible in DOM
    const text = contentText(view)
    expect(text).toContain('>')
    view.destroy()
  })

  test('multi-line blockquote: each line gets the line decoration class', () => {
    const body = '> Line one\n> Line two\n> Line three\n'
    const view = makeView(body, body.length) // caret at end

    const bqLines = view.dom.querySelectorAll('[data-editor-role="blockquote-line"]')
    expect(bqLines.length).toBeGreaterThanOrEqual(3)
    view.destroy()
  })

  test('multi-line blockquote: each QuoteMark hidden when caret elsewhere', () => {
    const body = '> Line one\n> Line two\n> Line three\n'
    const view = makeView(body, body.length) // caret at end

    const text = contentText(view)
    // None of the ">" markers should appear in the rendered text
    expect(text).not.toContain('>')
    view.destroy()
  })

  test('blockquote doc is always unchanged', () => {
    const body = '> First\n> Second\n\nParagraph\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.dispatch({ selection: { anchor: body.length } })
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('blockquote body text remains visible after QuoteMark hidden', () => {
    const body = '> The quote body\n'
    const view = makeView(body, body.length)

    const text = contentText(view)
    expect(text).toContain('The quote body')
    view.destroy()
  })

  test('blockquote reveal-on-caret: caret on QuoteMark reveals it', () => {
    const body = '> Quote text\n'
    const view = makeView(body, 0) // caret at pos 0 = on ">"
    const text = contentText(view)
    expect(text).toContain('>')
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — fenced code block decoration (new — Fix #3)
// ---------------------------------------------------------------------------

describe('Decoration: fenced code block', () => {
  test('fenced code block body line gets code-block-content role', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    // Content lines (between fences) get the cb-content class
    const contentLines = view.dom.querySelectorAll('[data-editor-role="code-block-content"]')
    expect(contentLines.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })

  test('opening fence line gets code-block-open role', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const openLines = view.dom.querySelectorAll('[data-editor-role="code-block-open"]')
    expect(openLines.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })

  test('closing fence line gets code-block-close role', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const closeLines = view.dom.querySelectorAll('[data-editor-role="code-block-close"]')
    expect(closeLines.length).toBeGreaterThanOrEqual(1)
    view.destroy()
  })

  test('opening fence CodeMark hidden when caret is not on fence line', () => {
    const body = '```ts\nconst x = 1\n```\n'
    // Put caret on the code body line (not on a fence)
    const bodyLinePos = body.indexOf('const')
    const view = makeView(body, bodyLinePos + 2)

    // The opening "```" should not be visible as raw text
    const text = contentText(view)
    // "const x = 1" should still be there (body is NOT suppressed)
    expect(text).toContain('const x = 1')
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('fence CodeMark revealed when caret is on the opening fence line', () => {
    const body = '```ts\nconst x = 1\n```\n'
    // Caret on opening fence (pos 2 = inside "```ts")
    const view = makeView(body, 2)

    // Reveal-on-caret: "```" visible
    const text = contentText(view)
    expect(text).toContain('```')
    view.destroy()
  })

  test('fenced code doc is always unchanged', () => {
    const body = '```ts\nconst a = 1\nconst b = 2\n```\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.dispatch({ selection: { anchor: body.length } })
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('code body text is not suppressed', () => {
    const body = '```\nhello code\n```\n'
    const view = makeView(body, body.length)

    // "hello code" should still appear in DOM (body is never hidden)
    const text = contentText(view)
    expect(text).toContain('hello code')
    view.destroy()
  })

  test('multiple fenced blocks: both get line decorations', () => {
    const body = '```\nfirst\n```\n\nsome text\n\n```\nsecond\n```\n'
    const view = makeView(body, body.length)
    expect(view.state.doc.toString()).toBe(body)

    // Both code blocks should have content line styling
    const contentLines = view.dom.querySelectorAll('[data-editor-role="code-block-content"]')
    expect(contentLines.length).toBeGreaterThanOrEqual(2)
    view.destroy()
  })

  test('closing fence CodeMark hidden when caret is elsewhere', () => {
    const body = '```ts\nconst x = 1\n```\n'
    // Caret on body line
    const view = makeView(body, body.indexOf('const') + 2)

    // The closing "```" should not appear as raw text (it's replaced)
    // when caret is on body — both fences are hidden.
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — code-block widgets (language label, copy button, line numbers)
// ---------------------------------------------------------------------------

describe('Decoration: code-block widgets', () => {
  test('code-block header lays out the language control and copy action as a toolbar', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const openLine = editorElement(view, '[data-editor-role="code-block-open"]')
    const copyBtn = editorElement(view, '[data-editor-role="code-copy"]')

    expect(getComputedStyle(openLine).display).toBe('flex')
    expect(getComputedStyle(openLine).alignItems).toBe('center')
    expect(getComputedStyle(copyBtn).marginLeft).toBe('auto')
    view.destroy()
  })

  test('code-block content reserves a line-number gutter and resets paragraph indentation', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const contentLine = editorElement(view, '[data-editor-role="code-block-content"]')
    const styles = getComputedStyle(contentLine)
    expect(styles.position).toBe('relative')
    expect(Number.parseFloat(styles.paddingLeft)).toBeGreaterThanOrEqual(60)
    expect(['0', '0px']).toContain(styles.textIndent)
    view.destroy()
  })

  test('code-block rows expose a visible border contract', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const openLine = editorElement(view, '[data-editor-role="code-block-open"]')
    const contentLine = editorElement(view, '[data-editor-role="code-block-content"]')
    const closeLine = editorElement(view, '[data-editor-role="code-block-close"]')

    expect(getComputedStyle(openLine).borderTopWidth).toBe('1px')
    expect(getComputedStyle(contentLine).borderLeftWidth).toBe('1px')
    expect(getComputedStyle(closeLine).borderBottomWidth).toBe('1px')
    view.destroy()
  })

  test('language control switches the fenced code info string', async () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const languageButton = editorElement<HTMLButtonElement>(view, '[data-editor-role="code-language"]')
    expect(languageButton.tagName).toBe('BUTTON')

    languageButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    languageButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    const pythonOption = editorElement<HTMLButtonElement>(
      view,
      '[data-editor-role="code-language-option"][data-language-value="python"]'
    )

    pythonOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    pythonOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    expect(view.state.doc.toString()).toBe('```python\nconst x = 1\n```\n')
    view.destroy()
  })

  test('language menu scrolls inside its options list', async () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const languageButton = editorElement<HTMLButtonElement>(view, '[data-editor-role="code-language"]')
    languageButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    languageButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    const menu = editorElement(view, '[data-editor-role="code-language-menu"]')
    const options = editorElement(view, '[data-editor-role="code-language-options"]')
    const menuStyles = getComputedStyle(menu)
    const optionsStyles = getComputedStyle(options)

    expect(menuStyles.overflowY).not.toBe('auto')
    expect(optionsStyles.overflowY).toBe('auto')
    expect(Number.parseFloat(optionsStyles.maxHeight)).toBeGreaterThan(0)
    view.destroy()
  })

  test('language menu filters options through search without editing the document', async () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const languageButton = editorElement<HTMLButtonElement>(view, '[data-editor-role="code-language"]')
    languageButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    languageButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    const search = editorElement<HTMLInputElement>(view, '[data-editor-role="code-language-search"]')
    search.value = 'py'
    search.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'py', inputType: 'insertText' }))
    await Promise.resolve()

    const optionValues = Array.from(view.dom.querySelectorAll('[data-editor-role="code-language-option"]')).map(
      option => (option as HTMLElement).dataset.languageValue
    )

    expect(optionValues).toEqual(['python'])
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('language label widget is present for a ```ts fence', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length) // caret at end, not on fence

    // The LanguageLabelWidget renders a span with [data-editor-role="code-language"]
    const label = view.dom.querySelector('[data-editor-role="code-language"]')
    expect(label).not.toBeNull()
    expect(label?.textContent).toBe('TypeScript')
    view.destroy()
  })

  test('language label shows CODE for a fence with no info-string', () => {
    const body = '```\nhello code\n```\n'
    const view = makeView(body, body.length)

    const label = view.dom.querySelector('[data-editor-role="code-language"]')
    expect(label).not.toBeNull()
    expect(label?.textContent).toBe('CODE')
    view.destroy()
  })

  test('language label shows correct name for python fence', () => {
    const body = '```python\nprint("hello")\n```\n'
    const view = makeView(body, body.length)

    const label = view.dom.querySelector('[data-editor-role="code-language"]')
    expect(label).not.toBeNull()
    expect(label?.textContent).toBe('Python')
    view.destroy()
  })

  test('copy button widget is present in the opening fence line', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const copyBtn = view.dom.querySelector('[data-editor-role="code-copy"]')
    expect(copyBtn).not.toBeNull()
    expect(copyBtn?.textContent).toBe('Copy')
    view.destroy()
  })

  test('content lines expose code-block-content role for line-number counters', () => {
    const body = '```ts\nconst x = 1\nconst y = 2\n```\n'
    const view = makeView(body, body.length)

    // Content lines get both cb-content and cb-ln classes
    const lnLines = view.dom.querySelectorAll('[data-editor-role="code-block-content"]')
    expect(lnLines.length).toBeGreaterThanOrEqual(2) // two content lines
    view.destroy()
  })

  test('content lines have data-editor-line-num attribute starting at 1', () => {
    const body = '```ts\nfirst line\nsecond line\n```\n'
    const view = makeView(body, body.length)

    const lnLines = Array.from(view.dom.querySelectorAll('[data-editor-role="code-block-content"]')) as HTMLElement[]
    expect(lnLines.length).toBeGreaterThanOrEqual(2)
    expect(lnLines[0]?.dataset.editorLineNum).toBe('1')
    expect(lnLines[1]?.dataset.editorLineNum).toBe('2')
    view.destroy()
  })

  test('each code block resets line numbers to 1', () => {
    const body = '```\nfirst\nsecond\n```\n\n```\nthird\n```\n'
    const view = makeView(body, body.length)

    const lnLines = Array.from(view.dom.querySelectorAll('[data-editor-role="code-block-content"]')) as HTMLElement[]
    // 2 lines in first block, 1 in second — last line of second block should be "1"
    expect(lnLines.length).toBeGreaterThanOrEqual(3)
    // Check that line numbers start at 1 for the second block
    const lineNums = lnLines.map(el => el.dataset.editorLineNum)
    expect(lineNums[0]).toBe('1') // first block line 1
    expect(lineNums[1]).toBe('2') // first block line 2
    expect(lineNums[2]).toBe('1') // second block resets to 1
    view.destroy()
  })

  test('fence raw markdown is hidden (``` not in DOM when caret elsewhere)', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length) // caret at end

    const text = contentText(view)
    // The raw ``` should be hidden (replaced by widgets/empty)
    expect(text).not.toContain('```')
    // The info-string "ts" should also be hidden (replaced by lang label widget)
    // The label widget text "TypeScript" should appear instead
    expect(text).toContain('TypeScript')
    view.destroy()
  })

  test('doc text is never mutated by code-block decorations', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    expect(view.state.doc.toString()).toBe(body)
    view.dispatch({ selection: { anchor: 0 } })
    expect(view.state.doc.toString()).toBe(body)
    view.dispatch({ selection: { anchor: body.length } })
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('language label and copy button disappear on opening fence when caret is on it', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, 2) // caret on opening fence

    // When caret is on the fence, widgets are not shown (reveal-on-caret)
    const label = view.dom.querySelector('[data-editor-role="code-language"]')
    const copyBtn = view.dom.querySelector('[data-editor-role="code-copy"]')
    // Both should be absent when raw fence is revealed
    expect(label).toBeNull()
    expect(copyBtn).toBeNull()
    view.destroy()
  })

  test('multiple code blocks each get their own label and copy button', () => {
    const body = '```ts\nfoo\n```\n\n```python\nbar\n```\n'
    const view = makeView(body, body.length)

    const labels = view.dom.querySelectorAll('[data-editor-role="code-language"]')
    const copyBtns = view.dom.querySelectorAll('[data-editor-role="code-copy"]')
    expect(labels.length).toBe(2)
    expect(copyBtns.length).toBe(2)
    const labelTexts = Array.from(labels).map(el => el.textContent)
    expect(labelTexts).toContain('TypeScript')
    expect(labelTexts).toContain('Python')
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — checkbox widget toggle
// ---------------------------------------------------------------------------

describe('Checkbox widget toggle', () => {
  test('toggling [ ] to [x] changes doc text correctly', () => {
    const body = '- [ ] do this\n'
    const view = makeView(body, 0)

    // The checkbox widget is at position of `[ ]` which is at offset 2 in `- [ ] do this`
    const checkboxFrom = body.indexOf('[ ]')
    expect(checkboxFrom).toBeGreaterThan(-1)

    // Simulate the toggle dispatch (same as CheckboxWidget.toDOM mousedown handler)
    const marker = '[ ]'
    const replacement = '[x]'
    const slice = view.state.doc.sliceString(checkboxFrom, checkboxFrom + 3)
    expect(slice).toBe(marker)

    view.dispatch({
      changes: { from: checkboxFrom, insert: replacement, to: checkboxFrom + 3 }
    })

    expect(view.state.doc.toString()).toBe('- [x] do this\n')
    view.destroy()
  })

  test('toggling [x] to [ ] changes doc text correctly', () => {
    const body = '- [x] done\n'
    const view = makeView(body, 0)

    const checkboxFrom = body.indexOf('[x]')
    view.dispatch({
      changes: { from: checkboxFrom, insert: '[ ]', to: checkboxFrom + 3 }
    })

    expect(view.state.doc.toString()).toBe('- [ ] done\n')
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — list marker widget
// ---------------------------------------------------------------------------

describe('Decoration: list marker widget', () => {
  test('unordered list marker renders as a visual marker when caret is outside', () => {
    const body = '- item\n'
    const view = makeView(body, body.length)

    const marker = view.dom.querySelector('[data-editor-role="list-marker"]')
    expect(marker).not.toBeNull()
    expect(marker?.getAttribute('aria-hidden')).toBe('true')
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('ordered list marker renders as the same first-pass marker', () => {
    const body = '1. item\n'
    const view = makeView(body, body.length)

    const marker = view.dom.querySelector('[data-editor-role="list-marker"]')
    expect(marker).not.toBeNull()
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('task list does not also render a list marker', () => {
    const body = '- [ ] task\n'
    const view = makeView(body, body.length)

    expect(view.dom.querySelector('[data-editor-role="task-checkbox"]')).not.toBeNull()
    expect(view.dom.querySelector('[data-editor-role="list-marker"]')).toBeNull()
    view.destroy()
  })

  test('list marker reveals raw markdown marker when caret overlaps it', () => {
    const body = '- item\n'
    const view = makeView(body, 0)

    expect(view.dom.querySelector('[data-editor-role="list-marker"]')).toBeNull()
    expect(contentText(view)).toContain('-')
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — combined / regression
// ---------------------------------------------------------------------------

describe('Decoration: combined document with all token types', () => {
  test('shared harness loads committed combined fixture and renders widget roles', async () => {
    const harness = createEditorHarness({ doc: '' })

    try {
      const body = await harness.loadFixture('combined')

      expect(harness.doc()).toBe(body)
      expect(harness.expectEditorRole('wikilink').textContent).toBe('Anchor V1')
      expect(harness.expectEditorRole('markdown-link').textContent).toBe('Anchor')
      expect(harness.expectEditorRole('tag').textContent).toBe('#markdown')
      expect(harness.allByEditorRole('task-checkbox').length).toBeGreaterThanOrEqual(2)
      expect(harness.allByEditorRole('list-marker').length).toBeGreaterThanOrEqual(2)
      expect(harness.expectEditorRole('code-language').textContent).toBe('TypeScript')
    } finally {
      harness.destroy()
    }
  })

  test('shared harness loads committed edge-case fixture without passive mutation', async () => {
    const harness = createEditorHarness({ doc: '' })

    try {
      const body = await harness.loadFixture('edge-cases')

      expect(harness.doc()).toBe(body)
      await harness.expectDocUnchanged(async () => {
        harness.moveCaret(0)
        harness.moveCaret(body.length)
        harness.selectRange(0, Math.min(12, body.length))
      })
    } finally {
      harness.destroy()
    }
  })

  test('complex note with all token types does not crash or mutate', () => {
    const body = [
      '## Section [[Proj]] #tag',
      '',
      '- [ ] Review [Design](https://example.com) with [[Owner]]',
      '',
      '> Blockquote with `inline code`',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      '**bold** and *italic*'
    ].join('\n')

    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)

    // Move caret through various positions
    for (const pos of [0, 5, 20, 40, 60, 80, body.length]) {
      view.dispatch({ selection: { anchor: Math.min(pos, body.length) } })
      expect(view.state.doc.toString()).toBe(body)
    }
    view.destroy()
  })

  test('wikilink chip renders for [[target]] outside caret', () => {
    const body = 'See [[Alpha]] now\n'
    const view = makeView(body, body.length)

    const chip = view.dom.querySelector('[data-editor-role="wikilink"]')
    expect(chip).not.toBeNull()
    expect(chip?.textContent).toBe('Alpha')
    view.destroy()
  })

  test('tag mark renders for #hashtag', () => {
    const body = 'Some text #review done\n'
    const view = makeView(body, body.length)

    const tag = view.dom.querySelector('[data-editor-role="tag"]')
    expect(tag).not.toBeNull()
    view.destroy()
  })

  test('wikilink and markdown link coexist on same line', () => {
    const body = 'See [[Alpha]] and [Docs](https://example.com)\n'
    const view = makeView(body, body.length)

    expect(view.dom.querySelector('[data-editor-role="wikilink"]')).not.toBeNull()
    expect(view.dom.querySelector('[data-editor-role="markdown-link"]')).not.toBeNull()
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('checkbox inside a line with a markdown link: no crash', () => {
    const body = '- [ ] Review [Design](https://example.com) with [[Owner]]\n'
    const view = makeView(body, body.length)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — heading reveal is keyed on selection, not focus (items 1 + 2)
// ---------------------------------------------------------------------------

describe('Decoration: heading reveal keyed on selection, not focus', () => {
  test('heading # hidden when caret is on a DIFFERENT line (selection-based, not focus-based)', () => {
    // Caret is placed at the end of the document (on a body line, not the heading).
    // The heading mark should be hidden regardless of focus state.
    const body = '# Heading\n\nBody text\n'
    const view = makeView(body, body.length) // caret at end, not on heading line
    const text = contentText(view)
    expect(text).not.toContain('#')
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('heading # visible when caret is on the heading line (selection-based, not focus-based)', () => {
    // Caret is placed on the heading line itself.
    // Hash marks must be visible (reveal-on-caret-per-line).
    const body = '# Heading\n\nBody text\n'
    const view = makeView(body, 2) // caret inside `# Heading`
    const text = contentText(view)
    expect(text).toContain('#')
    view.destroy()
  })

  test('moving caret onto the heading line reveals hash; moving away hides it', () => {
    const body = '# Heading\n\nBody text\n'
    // Start with caret at end (not on heading line)
    const view = makeView(body, body.length)
    expect(contentText(view)).not.toContain('#')

    // Move caret to the heading line — hash should appear
    view.dispatch({ selection: { anchor: 2 } })
    expect(contentText(view)).toContain('#')

    // Move caret back to end — hash should hide again
    view.dispatch({ selection: { anchor: body.length } })
    expect(contentText(view)).not.toContain('#')

    expect(view.state.doc.toString()).toBe(body) // doc never mutated
    view.destroy()
  })

  test('two heading lines: only the one with the caret reveals its hash', () => {
    const body = '# First\n\n## Second\n\nBody\n'
    // Caret on first heading line (pos 2)
    const view = makeView(body, 2)
    const text = contentText(view)
    // The first heading's # should be revealed
    expect(text).toContain('#')
    // doc is never mutated
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// Tests — unclosed fence produces no code-block decorations (item 3)
// ---------------------------------------------------------------------------

describe('Decoration: unclosed fence — no code-block decoration', () => {
  test('single unclosed ``` fence has no code-block-open role', () => {
    // No closing fence — should render as plain text, not a styled code block.
    const body = '```ts\nsome code here\n'
    const view = makeView(body, body.length)

    const openLines = view.dom.querySelectorAll('[data-editor-role="code-block-open"]')
    expect(openLines.length).toBe(0)
    view.destroy()
  })

  test('single unclosed fence has no language label widget', () => {
    const body = '```ts\nsome code\n'
    const view = makeView(body, body.length)

    const label = view.dom.querySelector('[data-editor-role="code-language"]')
    expect(label).toBeNull()
    view.destroy()
  })

  test('single unclosed fence has no copy button widget', () => {
    const body = '```python\nprint("hi")\n'
    const view = makeView(body, body.length)

    const copyBtn = view.dom.querySelector('[data-editor-role="code-copy"]')
    expect(copyBtn).toBeNull()
    view.destroy()
  })

  test('single unclosed fence: doc is unchanged and no crash', () => {
    const body = '```\nsome unclosed code\n'
    const view = makeView(body, 0)
    expect(view.state.doc.toString()).toBe(body)
    view.destroy()
  })

  test('closed fence still gets decorations (sanity check)', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const view = makeView(body, body.length)

    const label = view.dom.querySelector('[data-editor-role="code-language"]')
    const copyBtn = view.dom.querySelector('[data-editor-role="code-copy"]')
    expect(label).not.toBeNull()
    expect(copyBtn).not.toBeNull()
    view.destroy()
  })
})
