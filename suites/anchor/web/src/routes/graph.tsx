import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { useAnchor } from '../lib/anchor-context'
import { requireNoteId } from './-shared'

export const Route = createFileRoute('/graph')({
  component: GraphRoute
})

function GraphRoute() {
  const anchor = useAnchor()
  const currentNote = anchor.currentNote

  const graph = useQuery({
    enabled: !!currentNote,
    queryKey: ['graph', anchor.vaultRevision, currentNote?.metadata.id, 2],
    queryFn: () => anchor.backend.getGraphNeighborhood(requireNoteId(currentNote), 2)
  })

  return (
    <div className="route-stack" data-testid="graph-route">
      <header className="route-header">
        <div>
          <p>Local Graph</p>
          <h1>{currentNote?.metadata.title ?? 'Select a note'}</h1>
        </div>
      </header>
      <div className="graph-board">
        {(graph.data?.nodes ?? []).map(node => (
          <Link key={node.id} className="graph-node" to="/notes/$noteId" params={{ noteId: node.id }}>
            {node.title}
            <small>{node.type ?? node.kind}</small>
          </Link>
        ))}
      </div>
      <div className="edge-list">
        {(graph.data?.edges ?? []).map(edge => (
          <div key={edge.id} className="edge-row">
            <span>{edge.source}</span>
            <span>{edge.graphLayer}</span>
            <span>{edge.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
