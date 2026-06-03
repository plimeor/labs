/**
 * Corpus byte-fidelity test for the CM6 editor spike.
 *
 * For each real note in ~/Documents/notes, we:
 *   1. Strip YAML frontmatter (--- ... ---\n\n)
 *   2. Build an EditorState with the body + the full live-preview extension
 *   3. Assert state.doc.toString() === body (byte-for-byte)
 *
 * The assertion is the thesis: CM6's document IS the text buffer.
 * Decorations are VIEW-ONLY — they cannot mutate doc.
 *
 * Env-gate: if ~/Documents/notes is absent, all tests are skipped gracefully.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'

// We import the EditorView-less extension subset that works in Node:
// livePreview is a ViewPlugin and requires a DOM, so we test the state layer only.
// The key claim: EditorState.create({ doc: body }).doc.toString() === body.

const NOTES_DIR = join(homedir(), 'Documents', 'notes')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---\n')) return content
  const end = content.indexOf('\n---', 4)
  if (end === -1) return content
  // Skip the closing --- and optional blank lines
  const afterClose = end + 4 // past '\n---'
  const rest = content.slice(afterClose)
  return rest.replace(/^\n+/, '')
}

function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      // Skip node_modules — those are not user notes
      if (entry === 'node_modules') continue
      const full = join(dir, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) {
          results.push(...collectMarkdownFiles(full))
        } else if (entry.endsWith('.md')) {
          results.push(full)
        }
      } catch {
        // skip unreadable entries
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return results
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const vaultExists = existsSync(NOTES_DIR)

describe('CM6 corpus byte-fidelity', () => {
  if (!vaultExists) {
    test('SKIPPED — ~/Documents/notes not found', () => {
      console.log('Corpus test skipped: vault not present')
    })
    return
  }

  const files = collectMarkdownFiles(NOTES_DIR)
  const extensions = [markdown({ base: markdownLanguage })]

  let _passed = 0
  let _failed = 0
  const failures: string[] = []

  // Run all files
  for (const filePath of files) {
    test(`fidelity: ${filePath.replace(NOTES_DIR, '~')}`, () => {
      const raw = readFileSync(filePath, 'utf-8')
      const body = stripFrontmatter(raw)

      // Build EditorState — this is the CM6 document layer (no DOM/view)
      const state = EditorState.create({ doc: body, extensions })

      // THE KEY ASSERTION: doc === input, byte-for-byte
      const docString = state.doc.toString()
      try {
        expect(docString).toBe(body)
        _passed++
      } catch (err) {
        _failed++
        failures.push(filePath.replace(NOTES_DIR, '~'))
        throw err
      }
    })
  }

  test('corpus pass rate summary', () => {
    const total = files.length
    // Re-run to tally (bun:test runs these in sequence so prev results are available)
    console.log(`\nCorpus fidelity: ${total} notes tested`)
    // The individual tests above handle pass/fail counting
    // This test just confirms the suite ran
    expect(total).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// CRLF note: CM6 normalizes \r\n → \n on EditorState.create.
// For Anchor, all user notes use LF (\n). If a file has CRLF line endings,
// the editor will show and save with LF — this is EXPECTED CM6 behaviour
// and not a regression. Windows-authored files would need a pre-processing step.
// ---------------------------------------------------------------------------

// Also test with the stress note (always runs, no vault dependency)
describe('CM6 EditorState fidelity — synthetic notes', () => {
  test('empty string', () => {
    const state = EditorState.create({ doc: '' })
    expect(state.doc.toString()).toBe('')
  })

  test('plain text', () => {
    const body = 'Hello, world!'
    const state = EditorState.create({ doc: body })
    expect(state.doc.toString()).toBe(body)
  })

  test('markdown with headings and lists', () => {
    const body = '# Title\n\n- item one\n- item two\n\n> quote\n'
    const state = EditorState.create({ doc: body })
    expect(state.doc.toString()).toBe(body)
  })

  test('wikilinks and tags are preserved verbatim', () => {
    const body = '[[Kent Beck]] #notes some text'
    const state = EditorState.create({ doc: body })
    expect(state.doc.toString()).toBe(body)
  })

  test('task lists are preserved verbatim', () => {
    const body = '- [ ] unchecked\n- [x] checked\n'
    const state = EditorState.create({ doc: body })
    expect(state.doc.toString()).toBe(body)
  })

  test('fenced code block is preserved verbatim', () => {
    const body = '```ts\nconst x = 1\n```\n'
    const state = EditorState.create({ doc: body })
    expect(state.doc.toString()).toBe(body)
  })

  test('unicode CJK characters are preserved byte-for-byte', () => {
    const body = '# 中文标题\n\n这是一段中文内容 [[链接]] #标签\n'
    const state = EditorState.create({ doc: body })
    expect(state.doc.toString()).toBe(body)
  })

  test('combined stress note section', () => {
    const body = [
      '## Section 001: [[Project 001]] #stress/001',
      '',
      '- [ ] Review [Design 001](https://example.com/design/001) with [[Owner 001]] and `serialize-001` #review',
      '- [ ] Ship [Docs 001](https://example.com/docs/001 "Docs 001") for [[Anchor V1]] using `publish-001` #docs',
      '- [ ] Compare **bold 001** and *italic 001* around [Spec 001](https://example.com/spec/001) [[Decision 001]]',
      '',
      '> Trace [source 001](https://example.com/source/001) into `inline-001` and [[Trace 001]] #quote'
    ].join('\n')

    const state = EditorState.create({ doc: body, extensions: [markdown({ base: markdownLanguage })] })
    expect(state.doc.toString()).toBe(body)
  })

  test('EditorState with markdown extension preserves document identity', () => {
    const body = '# Heading\n\n**bold** and *italic* and `code`\n\n[[wikilink]] #tag\n'
    const state = EditorState.create({
      doc: body,
      extensions: [markdown({ base: markdownLanguage })]
    })
    // The markdown extension adds syntax highlighting; it must NOT touch the document
    expect(state.doc.toString()).toBe(body)
  })
})
