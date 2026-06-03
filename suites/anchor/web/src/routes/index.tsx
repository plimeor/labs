import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useAnchor } from '../lib/anchor-context'
import { RouteLoading } from './-shared'
import { NoteEditor } from './notes.$noteId'

export const Route = createFileRoute('/')({
  component: TodayRoute
})

function TodayRoute() {
  const anchor = useAnchor()
  const today = useQuery({
    queryKey: ['today', anchor.vaultRevision],
    queryFn: () => anchor.backend.openTodayJournal()
  })

  const note = today.data

  useEffect(() => {
    if (note) {
      anchor.selectNote(note)
    }
  }, [note, anchor])

  if (!note) {
    return <RouteLoading label="Opening today" />
  }

  return <NoteEditor note={note} />
}
