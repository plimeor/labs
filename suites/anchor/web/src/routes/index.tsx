import { useQuery } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import { createEffect, Show } from 'solid-js'

import { useAnchor } from '../lib/anchor-context'
import { RouteLoading } from './-shared'
import { NoteEditor } from './notes.$noteId'

export const Route = createFileRoute('/')({
  component: TodayRoute
})

function TodayRoute() {
  const anchor = useAnchor()
  const today = useQuery(() => ({
    queryKey: ['today', anchor.vaultRevision()],
    queryFn: () => anchor.backend.openTodayJournal()
  }))

  createEffect(() => {
    if (today.data) {
      anchor.selectNote(today.data)
    }
  })

  return (
    <Show when={today.data} fallback={<RouteLoading label="Opening today" />}>
      <NoteEditor note={today.data!} />
    </Show>
  )
}
