/**
 * CM6 keymap for Anchor list/quote continuation.
 *
 * These handlers manipulate TEXT directly — no tree mutations.
 * Mirrors the behaviour proven in src/editor/__tests__/editor-input.integration.test.ts
 * for the Lexical editor:
 *
 *   - Enter on a list item continues the list with the matching prefix.
 *     Ordered lists auto-increment the number.
 *   - Enter on an EMPTY list item (just the prefix with no content) exits
 *     the list by removing the prefix and leaving a plain line.
 *   - Enter on an empty blockquote line exits the quote.
 *   - Tab / Shift-Tab indent and outdent list items (2-space step).
 */

import type { Extension } from '@codemirror/state'
import type { Command, KeyBinding } from '@codemirror/view'
import { EditorView, keymap } from '@codemirror/view'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Prefix patterns we handle */
const BULLET_RE = /^(\s*)([-*])\s+(\[[ xX]\]\s+)?/
const ORDERED_RE = /^(\s*)(\d+)\.\s+/
const QUOTE_RE = /^(\s*>\s+)/

interface LineContext {
  lineFrom: number
  lineText: string
  indent: string
}

function _getLineContext(doc: { lineAt: (pos: number) => { from: number; text: string } }, pos: number): LineContext {
  const line = doc.lineAt(pos)
  const indent = line.text.match(/^(\s*)/)?.[1] ?? ''
  return { lineFrom: line.from, lineText: line.text, indent }
}

// ---------------------------------------------------------------------------
// Enter handler
// ---------------------------------------------------------------------------

export const handleEnterCommand: Command = view => {
  const { state } = view
  // Only act on a single, collapsed cursor
  if (state.selection.ranges.length !== 1) return false
  const sel = state.selection.main
  if (!sel.empty) return false

  const line = state.doc.lineAt(sel.from)
  const text = line.text

  // --- Bullet list (unordered or task) ---
  const bulletMatch = text.match(BULLET_RE)
  if (bulletMatch) {
    const prefix = bulletMatch[0]
    const content = text.slice(prefix.length)

    // Empty item — exit the list
    if (content.trim() === '') {
      view.dispatch({
        changes: { from: line.from, insert: '', to: line.to },
        selection: { anchor: line.from }
      })
      return true
    }

    // Non-empty — continue with a plain bullet (no task box on continuation)
    const indent = bulletMatch[1]
    const marker = bulletMatch[2]
    const newPrefix = `${indent}${marker} `
    view.dispatch({
      changes: { from: sel.from, insert: `\n${newPrefix}`, to: sel.to },
      selection: { anchor: sel.from + 1 + newPrefix.length }
    })
    return true
  }

  // --- Ordered list ---
  const orderedMatch = text.match(ORDERED_RE)
  if (orderedMatch) {
    const content = text.slice(orderedMatch[0].length)

    // Empty item — exit
    if (content.trim() === '') {
      view.dispatch({
        changes: { from: line.from, insert: '', to: line.to },
        selection: { anchor: line.from }
      })
      return true
    }

    const indent = orderedMatch[1]
    const currentNum = parseInt(orderedMatch[2], 10)
    const newNum = currentNum + 1
    const newPrefix = `${indent}${newNum}. `
    view.dispatch({
      changes: { from: sel.from, insert: `\n${newPrefix}`, to: sel.to },
      selection: { anchor: sel.from + 1 + newPrefix.length }
    })
    return true
  }

  // --- Blockquote ---
  const quoteMatch = text.match(QUOTE_RE)
  if (quoteMatch) {
    const quotePrefix = quoteMatch[1]
    const content = text.slice(quotePrefix.length)

    // Empty quote line — exit
    if (content.trim() === '') {
      view.dispatch({
        changes: { from: line.from, insert: '', to: line.to },
        selection: { anchor: line.from }
      })
      return true
    }

    // Continue the quote
    view.dispatch({
      changes: { from: sel.from, insert: `\n${quotePrefix}`, to: sel.to },
      selection: { anchor: sel.from + 1 + quotePrefix.length }
    })
    return true
  }

  return false
}

// ---------------------------------------------------------------------------
// Tab / Shift-Tab indent/outdent for list items
// ---------------------------------------------------------------------------

const STEP = '  ' // 2-space indent step

export const handleTabCommand: Command = view => {
  const { state } = view
  if (state.selection.ranges.length !== 1) return false
  const sel = state.selection.main

  const line = state.doc.lineAt(sel.from)
  const text = line.text

  // Only act inside a list item
  if (!BULLET_RE.test(text) && !ORDERED_RE.test(text)) return false

  view.dispatch({
    changes: { from: line.from, insert: STEP, to: line.from },
    selection: { anchor: sel.from + STEP.length }
  })
  return true
}

export const handleShiftTabCommand: Command = view => {
  const { state } = view
  if (state.selection.ranges.length !== 1) return false
  const sel = state.selection.main

  const line = state.doc.lineAt(sel.from)
  const text = line.text

  if (!BULLET_RE.test(text) && !ORDERED_RE.test(text)) return false

  // Remove leading spaces (up to STEP.length)
  const leadingSpaces = text.match(/^( +)/)?.[1] ?? ''
  const removeCount = Math.min(leadingSpaces.length, STEP.length)
  if (removeCount === 0) return false

  view.dispatch({
    changes: { from: line.from, insert: '', to: line.from + removeCount },
    selection: { anchor: Math.max(sel.from - removeCount, line.from) }
  })
  return true
}

// ---------------------------------------------------------------------------
// Code fence auto-pair
//
// When the user types a triple-backtick opening fence (``` or ```lang) on its
// own line and there is no matching closing fence after it in the document,
// auto-insert a blank body line and a closing ``` fence, then place the caret
// on the blank line between them.  This mirrors bracket auto-pairing.
// ---------------------------------------------------------------------------

/**
 * Returns true if the text from `searchFrom` to the end of the document
 * contains a line that is ONLY ``` (the closing fence).
 */
function hasClosingFenceAfter(docText: string, searchFrom: number): boolean {
  const remaining = docText.slice(searchFrom)
  // A closing fence is a line containing only ``` (possibly with trailing whitespace)
  return /^```\s*$/m.test(remaining)
}

/**
 * The raw handler for the code fence auto-pair input event.
 * Exported for direct invocation in tests (inputHandler.of only fires via DOM;
 * calling this function directly is the correct approach for unit-testing).
 */
export function codeFenceInputHandler(view: EditorView, _from: number, _to: number, text: string): boolean {
  // Only fire on the ` character
  if (text !== '`') return false

  const { state } = view
  if (state.selection.ranges.length !== 1) return false
  const sel = state.selection.main
  if (!sel.empty) return false

  // Check what will be in the document after this character is inserted.
  // We look at the current line up to the cursor position, plus the new char.
  const line = state.doc.lineAt(sel.from)
  const beforeCursor = line.text.slice(0, sel.from - line.from)
  const afterCursor = line.text.slice(sel.from - line.from)

  // The tentative new line text once this ` is appended
  const newLinePrefix = `${beforeCursor}\``

  // We only act when typing the 3rd backtick: the prefix so far is `` and
  // the resulting line would start with ``` (optionally followed by a lang id)
  if (!beforeCursor.startsWith('``') || beforeCursor !== '`'.repeat(beforeCursor.length)) return false
  if (beforeCursor.length !== 2) return false

  // After this insertion the line would be ```<afterCursor>
  const wouldBeFenceLine = `${newLinePrefix}${afterCursor}`
  if (!wouldBeFenceLine.startsWith('```')) return false

  // Only act when the opening fence is the ENTIRE line content (nothing before ```)
  // and the line has no non-whitespace after the fence info-string start
  // (we allow an info-string like ```ts but not something in the middle of a line)
  if (line.text.trim() !== '' && !line.text.trim().startsWith('``')) return false

  // Check whether a closing fence already exists after this line
  const docText = state.doc.toString()
  const afterThisLine = line.to + 1 // start of the next line
  if (hasClosingFenceAfter(docText, afterThisLine)) return false

  // Insert the ` that was typed, then auto-pair: add empty line + closing fence
  // Result:
  //   ```[lang]
  //   <cursor here>
  //   ```
  const insert = '`\n\n```'
  const newCursorPos = sel.from + 2 // after the typed ` and the \n, on the blank line
  view.dispatch({
    changes: { from: sel.from, insert, to: sel.to },
    selection: { anchor: newCursorPos }
  })
  return true
}

const codeFenceAutoPair: Extension = EditorView.inputHandler.of(codeFenceInputHandler)

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const anchorKeymap: Extension = [
  keymap.of([
    { key: 'Enter', run: handleEnterCommand } satisfies KeyBinding,
    { key: 'Tab', run: handleTabCommand } satisfies KeyBinding,
    { key: 'Shift-Tab', run: handleShiftTabCommand } satisfies KeyBinding
  ]),
  codeFenceAutoPair
]
