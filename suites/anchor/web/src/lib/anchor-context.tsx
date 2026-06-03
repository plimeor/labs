import { useQueryClient } from '@tanstack/solid-query'
import { type Accessor, createContext, createSignal, type JSX, useContext } from 'solid-js'

import { createAnchorBackend } from '../backend'
import type { AnchorBackend, NoteRecord } from '../domain/types'

interface AnchorContextValue {
  backend: AnchorBackend
  currentNote: Accessor<NoteRecord | undefined>
  dirtyNoteIds: Accessor<Set<string>>
  vaultRevision: Accessor<number>
  markClean: (noteId: string) => void
  markDirty: (noteId: string) => void
  refreshApp: () => void
  resetVaultSession: () => void
  selectNote: (note: NoteRecord | undefined) => void
}

// Created once, at module scope — the backend is a stable singleton for the app.
const backend = createAnchorBackend()

const AnchorContext = createContext<AnchorContextValue | undefined>(undefined)

export function AnchorProvider(props: { children: JSX.Element }) {
  const queryClient = useQueryClient()
  const [currentNote, setCurrentNote] = createSignal<NoteRecord | undefined>(undefined)
  const [dirtyNoteIds, setDirtyNoteIds] = createSignal(new Set<string>())
  const [vaultRevision, setVaultRevision] = createSignal(0)

  const value: AnchorContextValue = {
    backend,
    currentNote,
    dirtyNoteIds,
    vaultRevision,
    markClean(noteId) {
      setDirtyNoteIds(previous => {
        const next = new Set(previous)
        next.delete(noteId)
        return next
      })
    },
    markDirty(noteId) {
      setDirtyNoteIds(previous => new Set(previous).add(noteId))
    },
    refreshApp() {
      void queryClient.invalidateQueries()
    },
    resetVaultSession() {
      setCurrentNote(undefined)
      setDirtyNoteIds(new Set<string>())
      setVaultRevision(revision => revision + 1)
    },
    selectNote(note) {
      setCurrentNote(note)
    }
  }

  return <AnchorContext.Provider value={value}>{props.children}</AnchorContext.Provider>
}

export function useAnchor(): AnchorContextValue {
  const context = useContext(AnchorContext)
  if (!context) {
    throw new Error('useAnchor must be used inside AnchorProvider')
  }

  return context
}
