import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'

import { useAnchor } from '../lib/anchor-context'

export const Route = createFileRoute('/objects')({
  component: ObjectsRoute
})

function ObjectsRoute() {
  const anchor = useAnchor()
  const objects = useQuery({
    queryKey: ['objects', anchor.vaultRevision],
    queryFn: () => anchor.backend.getObjectTypes()
  })

  return (
    <div className="route-stack" data-testid="objects-route">
      <header className="route-header">
        <div>
          <p>Objects</p>
          <h1>Types and properties as enhancements</h1>
        </div>
      </header>
      <div className="object-grid">
        {(objects.data ?? []).map(object => (
          <section className="object-card" key={object.type}>
            <h2>{object.type}</h2>
            <p>{object.recommendedProperties.join(', ')}</p>
            {object.notes.map(note => (
              <Link className="object-note" to="/notes/$noteId" params={{ noteId: note.id }} key={note.id}>
                {note.title}
              </Link>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
