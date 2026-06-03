/**
 * Unit tests for AutosaveController.
 *
 * All tests run without a DOM — the controller is pure logic.
 * We override `schedule` / `cancel` to control timing manually.
 */

import { describe, expect, test } from 'bun:test'

import type { AutosaveResult, SaveStatus } from '../autosave-controller'
import { AutosaveController } from '../autosave-controller'

// ---------------------------------------------------------------------------
// Fake timer infrastructure
// ---------------------------------------------------------------------------

interface FakeTimer {
  id: ReturnType<typeof setTimeout>
  delayMs: number
  fn: () => void
  cancelled: boolean
}

function makeFakeTimers() {
  let nextId = 1
  const timers: FakeTimer[] = []

  const schedule = (delayMs: number, fn: () => void): ReturnType<typeof setTimeout> => {
    const id = nextId++ as unknown as ReturnType<typeof setTimeout>
    timers.push({ id, delayMs, fn, cancelled: false })
    return id
  }

  const cancel = (id: ReturnType<typeof setTimeout>) => {
    const timer = timers.find(t => t.id === id)
    if (timer) timer.cancelled = true
  }

  /** Run all non-cancelled timers with delay <= maxDelay (in order). */
  const flush = (maxDelay = Number.POSITIVE_INFINITY) => {
    const toRun = timers.filter(t => !t.cancelled && t.delayMs <= maxDelay).sort((a, b) => a.delayMs - b.delayMs)
    for (const t of toRun) {
      t.cancelled = true
      t.fn()
    }
  }

  return { schedule, cancel, flush }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeController(opts: {
  initialText?: string
  initialRevision?: string
  onSave?: (body: string, rev: string) => Promise<AutosaveResult>
  onDirtyChange?: (dirty: boolean) => void
  onDocReplace?: (body: string) => void
  schedule?: ReturnType<typeof makeFakeTimers>['schedule']
  cancel?: ReturnType<typeof makeFakeTimers>['cancel']
}) {
  const statuses: SaveStatus[] = []
  const dirtyChanges: boolean[] = []
  let currentText = opts.initialText ?? 'initial text'

  const timers = makeFakeTimers()

  const controller = new AutosaveController(currentText, opts.initialRevision ?? 'rev-0', {
    cancel: opts.cancel ?? timers.cancel,
    debounceMs: 700,
    onDocReplace: opts.onDocReplace,
    onSave: opts.onSave ?? (async (body, rev) => ({ body, revision: `${rev}-saved` })),
    schedule: opts.schedule ?? timers.schedule,
    getCurrentText: () => currentText,
    onDirtyChange: dirty => {
      dirtyChanges.push(dirty)
      opts.onDirtyChange?.(dirty)
    },
    onStatusChange: s => statuses.push(s)
  })

  const setText = (text: string) => {
    currentText = text
  }

  return { controller, statuses, dirtyChanges, timers, setText }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutosaveController: initial state', () => {
  test('status starts as "starting"', () => {
    const { controller } = makeController({})
    expect(controller.status).toBe('starting')
  })

  test('baseRevision reflects constructor arg', () => {
    const { controller } = makeController({ initialRevision: 'abc-123' })
    expect(controller.baseRevision).toBe('abc-123')
  })
})

describe('AutosaveController: load()', () => {
  test('load resets status to "clean"', () => {
    const { controller, statuses } = makeController({})
    controller.load('new text', 'rev-1')
    expect(controller.status).toBe('clean')
    expect(statuses).toContain('clean')
  })

  test('load updates baseRevision', () => {
    const { controller } = makeController({ initialRevision: 'rev-0' })
    controller.load('text', 'rev-5')
    expect(controller.baseRevision).toBe('rev-5')
  })
})

describe('AutosaveController: onChange → dirty → debounce → saved', () => {
  test('onChange with same text → no dirty change, status stays clean after load', () => {
    const { controller, dirtyChanges } = makeController({ initialText: 'hello' })
    controller.load('hello', 'rev-0')
    controller.onChange('hello')
    expect(controller.status).toBe('clean')
    expect(dirtyChanges.filter(d => d === true)).toHaveLength(0)
  })

  test('onChange with different text → status dirty, onDirtyChange(true) fired', () => {
    const { controller, statuses, dirtyChanges } = makeController({ initialText: 'hello' })
    controller.load('hello', 'rev-0')
    controller.onChange('hello world')
    expect(statuses).toContain('dirty')
    expect(dirtyChanges).toContain(true)
  })

  test('debounce fires → onSave called with current text and baseRevision', async () => {
    const saveCalls: Array<{ body: string; rev: string }> = []
    const { controller, timers, setText } = makeController({
      initialRevision: 'rev-0',
      initialText: 'original',
      onSave: async (body, rev) => {
        saveCalls.push({ body, rev })
        return { body, revision: 'rev-1' }
      }
    })
    controller.load('original', 'rev-0')
    setText('edited text')
    controller.onChange('edited text')

    // Before debounce fires — onSave not called yet
    expect(saveCalls).toHaveLength(0)

    // Fire the debounce (700ms timer)
    timers.flush(700)
    // Wait for the async save promise to resolve
    await Promise.resolve()
    await Promise.resolve()

    expect(saveCalls).toHaveLength(1)
    expect(saveCalls[0].body).toBe('edited text')
    expect(saveCalls[0].rev).toBe('rev-0')
  })

  test('after successful save → status "saved", then "clean" after 1200ms timer', async () => {
    const { controller, statuses, timers, setText } = makeController({
      initialRevision: 'rev-0',
      initialText: 'original',
      onSave: async body => ({ body, revision: 'rev-1' })
    })
    controller.load('original', 'rev-0')
    setText('edited')
    controller.onChange('edited')
    timers.flush(700)
    // Wait for async save
    await Promise.resolve()
    await Promise.resolve()

    expect(statuses).toContain('saving')
    expect(statuses).toContain('saved')
    expect(controller.baseRevision).toBe('rev-1')

    // Now fire the 1200ms "saved → clean" timer
    timers.flush(1200)
    expect(controller.status).toBe('clean')
  })

  test('after save → onDirtyChange(false) is emitted', async () => {
    const { controller, dirtyChanges, timers, setText } = makeController({
      initialText: 'original',
      onSave: async body => ({ body, revision: 'rev-1' })
    })
    controller.load('original', 'rev-0')
    setText('edited')
    controller.onChange('edited')
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(dirtyChanges).toContain(false)
  })
})

describe('AutosaveController: conflict handling', () => {
  test('onSave rejects with "conflict" → status set to "conflict"', async () => {
    const { controller, statuses, timers, setText } = makeController({
      initialText: 'original',
      onSave: async () => {
        throw new Error('Save failed: conflict detected')
      }
    })
    controller.load('original', 'rev-0')
    setText('edited')
    controller.onChange('edited')
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(statuses).toContain('conflict')
    expect(controller.status).toBe('conflict')
  })

  test('conflict blocks further saves — subsequent onChange leaves status as conflict', async () => {
    const saveCalls: number[] = []
    const { controller, timers, setText } = makeController({
      initialText: 'original',
      onSave: async () => {
        saveCalls.push(1)
        throw new Error('conflict')
      }
    })
    controller.load('original', 'rev-0')
    setText('edit1')
    controller.onChange('edit1')
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.status).toBe('conflict')
    const savesBefore = saveCalls.length

    // Further edits should NOT trigger a new save
    setText('edit2')
    controller.onChange('edit2')
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(saveCalls.length).toBe(savesBefore)
    expect(controller.status).toBe('conflict')
  })

  test('non-conflict error → status "failed"', async () => {
    const { controller, timers, setText } = makeController({
      initialText: 'original',
      onSave: async () => {
        throw new Error('Network timeout')
      }
    })
    controller.load('original', 'rev-0')
    setText('edited')
    controller.onChange('edited')
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.status).toBe('failed')
  })
})

describe('AutosaveController: noteId/body change (load)', () => {
  test('load() with new text clears dirty state', async () => {
    const { controller, dirtyChanges, setText } = makeController({
      initialText: 'original'
    })
    controller.load('original', 'rev-0')
    // Make it dirty
    setText('edited')
    controller.onChange('edited')
    expect(controller.status).toBe('dirty')

    // Load a new note
    controller.load('new note body', 'rev-new')
    expect(controller.status).toBe('clean')
    // Most recent dirtyChanges entry should be false
    expect(dirtyChanges.at(-1)).toBe(false)
  })

  test('load() cancels pending debounce (no save after load)', async () => {
    const saveCalls: number[] = []
    const { controller, timers, setText } = makeController({
      initialText: 'original',
      onSave: async body => {
        saveCalls.push(1)
        return { body, revision: 'r' }
      }
    })
    controller.load('original', 'rev-0')
    setText('edited')
    controller.onChange('edited')

    // Load before debounce fires
    controller.load('new note', 'rev-new')
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    // The earlier scheduled save should have been cancelled
    expect(saveCalls).toHaveLength(0)
  })
})

describe('AutosaveController: coalesce saves in flight', () => {
  test('changes while save in flight → saveRequestedAfterFlight triggers another save', async () => {
    let saveCount = 0
    let resolveFirst: ((v: AutosaveResult) => void) | undefined

    const { controller, timers, setText } = makeController({
      initialText: 'original',
      onSave: async body => {
        saveCount++
        if (saveCount === 1) {
          return new Promise<AutosaveResult>(resolve => {
            resolveFirst = () => resolve({ body, revision: 'rev-1' })
          })
        }
        return { body, revision: 'rev-2' }
      }
    })
    controller.load('original', 'rev-0')

    // First edit — triggers save after debounce
    setText('edit1')
    controller.onChange('edit1')
    timers.flush(700)
    // Save is now in flight (async, not resolved yet)

    // Second edit while in flight
    setText('edit2')
    controller.onChange('edit2')

    // Resolve the first save
    resolveFirst?.({ body: 'edit1', revision: 'rev-1' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // A second save should be scheduled
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(saveCount).toBeGreaterThanOrEqual(2)
  })
})

describe('AutosaveController: onDocReplace', () => {
  test('when server returns different body, onDocReplace is called', async () => {
    const replacements: string[] = []
    const { controller, timers, setText } = makeController({
      initialText: 'original',
      onDocReplace: body => replacements.push(body),
      onSave: async _body => ({ body: 'server-normalized', revision: 'rev-1' })
    })
    controller.load('original', 'rev-0')
    setText('edited')
    controller.onChange('edited')
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(replacements).toContain('server-normalized')
  })

  test('when server returns same body, onDocReplace is NOT called', async () => {
    const replacements: string[] = []
    const { controller, timers, setText } = makeController({
      initialText: 'original',
      onDocReplace: body => replacements.push(body),
      onSave: async body => ({ body, revision: 'rev-1' })
    })
    controller.load('original', 'rev-0')
    setText('edited')
    controller.onChange('edited')
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(replacements).toHaveLength(0)
  })
})

describe('AutosaveController: destroy()', () => {
  test('destroy cancels pending timers and does not fire save', async () => {
    const saveCalls: number[] = []
    const { controller, timers, setText } = makeController({
      initialText: 'original',
      onSave: async body => {
        saveCalls.push(1)
        return { body, revision: 'rev-1' }
      }
    })
    controller.load('original', 'rev-0')
    setText('edited')
    controller.onChange('edited')

    // Destroy before debounce fires
    controller.destroy()
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(saveCalls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Tests — autosave must NOT trim whitespace or blank lines (item 6)
// ---------------------------------------------------------------------------

describe('AutosaveController: verbatim save — no trim', () => {
  test('trailing blank lines survive load → edit → save', async () => {
    // A note body with trailing blank lines and trailing spaces.
    const bodyWithTrailing = 'Line one\nLine two\n\n\n'
    const savedBodies: string[] = []

    const { controller, timers, setText } = makeController({
      initialText: bodyWithTrailing,
      onSave: async body => {
        savedBodies.push(body)
        return { body, revision: 'rev-1' }
      }
    })
    controller.load(bodyWithTrailing, 'rev-0')

    // Simulate a minimal edit then revert to the same trailing-whitespace text
    const edited = `${bodyWithTrailing}extra\n\n\n`
    setText(edited)
    controller.onChange(edited)
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    // The saved body must be VERBATIM — no trimming of trailing lines
    expect(savedBodies).toHaveLength(1)
    expect(savedBodies[0]).toBe(edited)
    expect(savedBodies[0].endsWith('\n\n\n')).toBe(true)
  })

  test('trailing spaces on lines survive round-trip', async () => {
    const bodyWithSpaces = 'Line with trailing   \nAnother line  \n'
    const savedBodies: string[] = []

    const { controller, timers, setText } = makeController({
      initialText: bodyWithSpaces,
      onSave: async body => {
        savedBodies.push(body)
        return { body, revision: 'rev-1' }
      }
    })
    controller.load(bodyWithSpaces, 'rev-0')

    // Edit to trigger a save
    const edited = `${bodyWithSpaces}new line\n`
    setText(edited)
    controller.onChange(edited)
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    expect(savedBodies).toHaveLength(1)
    // The lines with trailing spaces must be preserved verbatim
    expect(savedBodies[0]).toContain('trailing   ')
    expect(savedBodies[0]).toContain('Another line  ')
  })

  test('saving text that is identical to lastSavedText does not trigger a save', async () => {
    const body = 'hello\n\n\n'
    const saveCalls: string[] = []

    const { controller, timers, setText } = makeController({
      initialText: body,
      onSave: async b => {
        saveCalls.push(b)
        return { body: b, revision: 'rev-1' }
      }
    })
    controller.load(body, 'rev-0')

    // "Edit" back to exactly the same text (no-op)
    setText(body)
    controller.onChange(body)
    timers.flush(700)
    await Promise.resolve()
    await Promise.resolve()

    // No save should have been triggered since text === lastSavedText
    expect(saveCalls).toHaveLength(0)
  })
})
