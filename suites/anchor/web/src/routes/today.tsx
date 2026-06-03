import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useAnchor } from '../lib/anchor-context'
import { RouteLoading } from './-shared'
import { NoteEditor } from './notes.$noteId'

export const Route = createFileRoute('/today')({
  component: TodayRoute
})

function TodayRoute() {
  const anchor = useAnchor()
  const today = useQuery({
    queryKey: ['today', anchor.vaultRevision],
    queryFn: () => anchor.backend.openTodayJournal()
  })

  const note = today.data
  const { selectNote } = anchor

  useEffect(() => {
    if (note) {
      selectNote(note)
    }
  }, [note, selectNote])

  if (!note) {
    return <RouteLoading label="Opening today" />
  }

  return <NoteEditor note={note} />
}
