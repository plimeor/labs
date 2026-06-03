/**
 * AutosaveController — pure state machine for CM6 editor autosave.
 *
 * Extracted from the component so it can be unit-tested without a DOM.
 * The controller is responsible for debounce scheduling but delegates
 * the actual setTimeout/clearTimeout so tests can override them.
 */

export type SaveStatus = 'clean' | 'conflict' | 'dirty' | 'failed' | 'saved' | 'saving' | 'starting'

export interface AutosaveResult {
  body: string
  revision: string
}

export interface AutosaveControllerOptions {
  /** Debounce delay in ms before triggering a save (default 1000). */
  debounceMs?: number
  /** Override for scheduling — defaults to setTimeout. */
  schedule?: (delayMs: number, fn: () => void) => ReturnType<typeof setTimeout>
  /** Override for cancellation — defaults to clearTimeout. */
  cancel?: (id: ReturnType<typeof setTimeout>) => void
  /** The actual save operation — must reject with message containing "conflict" on conflict. */
  onSave: (body: string, baseRevision: string) => Promise<AutosaveResult>
  /** Called whenever status changes. */
  onStatusChange: (status: SaveStatus) => void
  /** Called when dirty state toggles. */
  onDirtyChange?: (dirty: boolean) => void
  /** Called when the server returns a body that differs from what was sent. */
  onDocReplace?: (body: string) => void
  /** Returns the current editor text at call time (used in the debounce callback). */
  getCurrentText: () => string
}

export class AutosaveController {
  private _baseRevision: string
  private _lastSavedText: string
  private _status: SaveStatus = 'starting'
  private _saveInFlight = false
  private _saveRequestedAfterFlight = false
  private _blockedByConflict = false
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined
  private _savedStatusTimer: ReturnType<typeof setTimeout> | undefined
  private _wasDirty: boolean | undefined

  private readonly _opts: Required<Pick<AutosaveControllerOptions, 'debounceMs' | 'schedule' | 'cancel'>> &
    AutosaveControllerOptions

  constructor(initialText: string, initialRevision: string, opts: AutosaveControllerOptions) {
    this._lastSavedText = initialText
    this._baseRevision = initialRevision
    this._opts = {
      debounceMs: 1000,
      cancel: id => clearTimeout(id),
      schedule: (ms, fn) => setTimeout(fn, ms),
      ...opts
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  get status(): SaveStatus {
    return this._status
  }

  get baseRevision(): string {
    return this._baseRevision
  }

  get lastSavedText(): string {
    return this._lastSavedText
  }

  /** Called by the editor on every document change with the current text. */
  onChange(currentText: string): void {
    this._clearDebounce()
    const dirty = currentText !== this._lastSavedText
    this._emitDirty(dirty)

    if (!dirty) {
      this._blockedByConflict = false
      this._setStatus('clean')
      return
    }

    if (this._blockedByConflict) {
      this._setStatus('conflict')
      return
    }

    this._setStatus('dirty')

    if (this._saveInFlight) {
      this._saveRequestedAfterFlight = true
      return
    }

    this._debounceTimer = this._opts.schedule(this._opts.debounceMs, () => {
      void this._flush()
    })
  }

  /** Load a new note — resets all autosave state. */
  load(text: string, revision: string): void {
    this._clearDebounce()
    this._clearSavedTimer()
    this._lastSavedText = text
    this._baseRevision = revision
    this._blockedByConflict = false
    this._saveRequestedAfterFlight = false
    this._wasDirty = undefined
    this._setStatus('clean')
    this._emitDirty(false)
  }

  /** Force an immediate save (e.g. Cmd+S). Cancels any pending debounce first. */
  flush(): Promise<void> {
    this._clearDebounce()
    return this._flush()
  }

  /** Tear-down — cancel all pending timers. */
  destroy(): void {
    this._clearDebounce()
    this._clearSavedTimer()
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _emitDirty(dirty: boolean): void {
    if (dirty !== this._wasDirty) {
      this._wasDirty = dirty
      this._opts.onDirtyChange?.(dirty)
    }
  }

  private _setStatus(next: SaveStatus): void {
    if (next === this._status) return
    this._status = next
    this._opts.onStatusChange(next)
  }

  private _clearDebounce(): void {
    if (this._debounceTimer !== undefined) {
      this._opts.cancel(this._debounceTimer)
      this._debounceTimer = undefined
    }
  }

  private _clearSavedTimer(): void {
    if (this._savedStatusTimer !== undefined) {
      this._opts.cancel(this._savedStatusTimer)
      this._savedStatusTimer = undefined
    }
  }

  private async _flush(): Promise<void> {
    if (this._saveInFlight) {
      this._saveRequestedAfterFlight = true
      return
    }

    const textToSave = this._opts.getCurrentText()

    if (textToSave === this._lastSavedText) {
      this._setStatus('clean')
      return
    }

    this._saveInFlight = true
    this._saveRequestedAfterFlight = false
    this._setStatus('saving')

    try {
      const result = await this._opts.onSave(textToSave, this._baseRevision)
      this._blockedByConflict = false
      this._baseRevision = result.revision

      if (result.body !== textToSave) {
        this._opts.onDocReplace?.(result.body)
        this._lastSavedText = result.body
      } else {
        this._lastSavedText = textToSave
      }

      this._setStatus('saved')
      this._emitDirty(false)
      this._clearSavedTimer()
      this._savedStatusTimer = this._opts.schedule(1200, () => {
        this._setStatus('clean')
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this._blockedByConflict = message.toLowerCase().includes('conflict')
      this._setStatus(this._blockedByConflict ? 'conflict' : 'failed')
    } finally {
      this._saveInFlight = false
      if (!this._blockedByConflict && this._saveRequestedAfterFlight) {
        this._saveRequestedAfterFlight = false
        this._debounceTimer = this._opts.schedule(this._opts.debounceMs, () => {
          void this._flush()
        })
      }
    }
  }
}

export function statusLabel(status: SaveStatus): string {
  switch (status) {
    case 'clean':
      return 'Saved'
    case 'conflict':
      return 'Conflict'
    case 'dirty':
      return 'Autosaving'
    case 'failed':
      return 'Save failed'
    case 'saved':
      return 'Saved'
    case 'saving':
      return 'Saving'
    case 'starting':
      return 'Opening'
  }
}
