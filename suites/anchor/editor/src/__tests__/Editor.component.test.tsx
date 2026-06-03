import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'

import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createSignal, type JSX } from 'solid-js'
import h from 'solid-js/h'
import { render } from 'solid-js/web'

import { Editor } from '../editor/Editor'
import { EditorStatus } from '../editor/EditorStatus'

let cleanup: (() => void) | undefined

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' })
  ;(globalThis as typeof globalThis & { React: unknown }).React = {
    Fragment: h.Fragment,
    createElement: h
  }
})

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  document.body.replaceChildren()
})

afterAll(() => {
  GlobalRegistrator.unregister()
})

function mount(create: () => unknown) {
  const root = document.createElement('main')
  document.body.append(root)
  cleanup = render(create as () => JSX.Element, root)
  return root
}

async function waitFor(assertion: () => boolean, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (assertion()) return
    await Bun.sleep(20)
  }

  expect(assertion()).toBe(true)
}

describe('Editor component shell', () => {
  test('mounts the production editor surface and renders live-preview widgets', async () => {
    mount(() =>
      h(Editor, {
        baseRevision: 'r1',
        body: 'Intro [[Target]] #tag\n\n```ts\nconst value = 1\n```',
        noteId: 'note-1',
        onAutosave: async (body: string) => ({ body, revision: 'r2' })
      })
    )

    await waitFor(() => document.querySelector('[data-testid="live-preview-surface"]') !== null)

    expect(document.querySelector('[data-testid="markdown-editor"]')).not.toBeNull()
    expect(document.querySelector('[data-editor-role="wikilink"]')?.textContent).toBe('Target')
    expect(document.querySelector('[data-editor-role="tag"]')?.textContent).toBe('#tag')
    expect(document.querySelector('[data-editor-role="code-language"]')?.textContent).toBe('TypeScript')
  })

  test('replaces the document when note identity changes', async () => {
    const [note, setNote] = createSignal({ body: 'First [[One]]', id: 'one', revision: 'r1' })

    mount(() =>
      h(Editor, {
        baseRevision: () => note().revision,
        body: () => note().body,
        noteId: () => note().id,
        onAutosave: async (body: string) => ({ body, revision: 'saved' })
      })
    )

    await waitFor(() => document.querySelector('[data-editor-role="wikilink"]')?.textContent === 'One')

    setNote({ body: 'Second [[Two]]', id: 'two', revision: 'r2' })

    await waitFor(() => document.querySelector('[data-editor-role="wikilink"]')?.textContent === 'Two')
    expect(document.querySelector('.cm-content')?.textContent).toContain('Second')
  })

  test('routes widget document changes through autosave and shows conflict status', async () => {
    const savedBodies: string[] = []

    mount(() =>
      h(Editor, {
        baseRevision: 'r1',
        body: '- [ ] task',
        noteId: 'task-note',
        onAutosave: async (body: string) => {
          savedBodies.push(body)
          throw new Error('conflict: stale test revision')
        }
      })
    )

    await waitFor(() => document.querySelector('[data-editor-role="task-checkbox"]') !== null)
    document
      .querySelector('[data-editor-role="task-checkbox"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    await waitFor(() => savedBodies.length === 1, 1300)
    expect(savedBodies[0]).toBe('- [x] task')
  })

  test('routes wikilink open events through the component callback', async () => {
    const openedTargets: string[] = []

    mount(() =>
      h(Editor, {
        baseRevision: 'r1',
        body: 'Open [[Target]]',
        noteId: 'wiki-note',
        onAutosave: async (body: string) => ({ body, revision: 'r2' }),
        onOpenWikilink: (target: string) => openedTargets.push(target)
      })
    )

    await waitFor(() => document.querySelector('[data-editor-role="wikilink"]') !== null)
    document
      .querySelector('[data-editor-role="wikilink"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true }))

    expect(openedTargets).toEqual(['Target'])
  })

  test('EditorStatus renders only problem states', () => {
    const cleanRoot = mount(() => h(EditorStatus, { status: 'clean' }))
    expect(cleanRoot.querySelector('[data-testid="round-trip-status"]')).toBeNull()

    cleanup?.()
    cleanup = undefined
    document.body.replaceChildren()

    const conflictRoot = mount(() => h(EditorStatus, { status: 'conflict' }))
    expect(conflictRoot.querySelector('[data-testid="round-trip-status"]')?.textContent).toBe('Conflict')
  })
})
