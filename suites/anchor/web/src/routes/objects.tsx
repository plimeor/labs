import { useQuery } from '@tanstack/solid-query'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { For } from 'solid-js'

import { useAnchor } from '../lib/anchor-context'

export const Route = createFileRoute('/objects')({
  component: ObjectsRoute
})

function ObjectsRoute() {
  const anchor = useAnchor()
  const objects = useQuery(() => ({
    queryKey: ['objects', anchor.vaultRevision()],
    queryFn: () => anchor.backend.getObjectTypes()
  }))

  return (
    <div class="route-stack" data-testid="objects-route">
      <header class="route-header">
        <div>
          <p>Objects</p>
          <h1>Types and properties as enhancements</h1>
        </div>
      </header>
      <div class="object-grid">
        <For each={objects.data ?? []}>
          {object => (
            <section class="object-card">
              <h2>{object.type}</h2>
              <p>{object.recommendedProperties.join(', ')}</p>
              <For each={object.notes}>
                {note => (
                  <Link class="object-note" to="/notes/$noteId" params={{ noteId: note.id }}>
                    {note.title}
                  </Link>
                )}
              </For>
            </section>
          )}
        </For>
      </div>
    </div>
  )
}
