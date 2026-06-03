import { useQuery } from '@tanstack/solid-query'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { For } from 'solid-js'

import { useAnchor } from '../lib/anchor-context'
import { requireNoteId } from './-shared'

export const Route = createFileRoute('/graph')({
  component: GraphRoute
})

function GraphRoute() {
  const anchor = useAnchor()

  const graph = useQuery(() => ({
    enabled: !!anchor.currentNote(),
    queryKey: ['graph', anchor.vaultRevision(), anchor.currentNote()?.metadata.id, 2],
    queryFn: () => anchor.backend.getGraphNeighborhood(requireNoteId(anchor.currentNote()), 2)
  }))

  return (
    <div class="route-stack" data-testid="graph-route">
      <header class="route-header">
        <div>
          <p>Local Graph</p>
          <h1>{anchor.currentNote()?.metadata.title ?? 'Select a note'}</h1>
        </div>
      </header>
      <div class="graph-board">
        <For each={graph.data?.nodes ?? []}>
          {node => (
            <Link class="graph-node" to="/notes/$noteId" params={{ noteId: node.id }}>
              {node.title}
              <small>{node.type ?? node.kind}</small>
            </Link>
          )}
        </For>
      </div>
      <div class="edge-list">
        <For each={graph.data?.edges ?? []}>
          {edge => (
            <div class="edge-row">
              <span>{edge.source}</span>
              <span>{edge.graphLayer}</span>
              <span>{edge.status}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
