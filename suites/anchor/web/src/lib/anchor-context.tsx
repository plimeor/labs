import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

import { createAnchorBackend } from '../backend'
import type { AnchorBackend, NoteRecord } from '../domain/types'

interface AnchorContextValue {
  backend: AnchorBackend
  currentNote: NoteRecord | undefined
  dirtyNoteIds: Set<string>
  vaultRevision: number
  markClean: (noteId: string) => void
  markDirty: (noteId: string) => void
  refreshApp: () => void
  resetVaultSession: () => void
  selectNote: (note: NoteRecord | undefined) => void
}

// Created once, at module scope — the backend is a stable singleton for the app.
const backend = createAnchorBackend()

const AnchorContext = createContext<AnchorContextValue | undefined>(undefined)

export function AnchorProvider(props: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [currentNote, setCurrentNote] = useState<NoteRecord | undefined>(undefined)
  const [dirtyNoteIds, setDirtyNoteIds] = useState(new Set<string>())
  const [vaultRevision, setVaultRevision] = useState(0)

  const value = useMemo<AnchorContextValue>(
    () => ({
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
    }),
    [currentNote, dirtyNoteIds, vaultRevision, queryClient]
  )

  return <AnchorContext.Provider value={value}>{props.children}</AnchorContext.Provider>
}

export function useAnchor(): AnchorContextValue {
  const context = useContext(AnchorContext)
  if (!context) {
    throw new Error('useAnchor must be used inside AnchorProvider')
  }

  return context
}
