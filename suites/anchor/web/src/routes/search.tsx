import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import type { SearchRequest } from '../domain/types'
import { useAnchor } from '../lib/anchor-context'

export const Route = createFileRoute('/search')({
  component: SearchRoute
})

function SearchRoute() {
  const anchor = useAnchor()
  const [query, setQuery] = useState('Anchor')
  const [tag, setTag] = useState('')
  const [objectTypeFilter, setObjectTypeFilter] = useState('')
  const [propertyKey, setPropertyKey] = useState('')
  const [propertyValue, setPropertyValue] = useState('')
  const request = useMemo<SearchRequest>(() => {
    const nextRequest: SearchRequest = {
      fields: ['id', 'title', 'snippet', 'metadata'],
      limit: 20,
      query,
      scope: { kind: 'all' }
    }
    const trimmedTag = tag.trim()
    const trimmedType = objectTypeFilter.trim()
    const trimmedPropertyKey = propertyKey.trim()
    const trimmedPropertyValue = propertyValue.trim()

    if (trimmedTag) nextRequest.tag = trimmedTag
    if (trimmedType) nextRequest.type = trimmedType
    if (trimmedPropertyKey) nextRequest.propertyKey = trimmedPropertyKey
    if (trimmedPropertyValue) nextRequest.propertyValue = trimmedPropertyValue

    return nextRequest
  }, [query, tag, objectTypeFilter, propertyKey, propertyValue])
  const results = useQuery({
    queryKey: ['search', anchor.vaultRevision, request],
    queryFn: () => anchor.backend.searchNotes(request)
  })

  return (
    <div className="route-stack" data-testid="search-route">
      <header className="route-header">
        <div>
          <p>Search</p>
          <h1>Markdown and metadata</h1>
        </div>
      </header>
      <section className="search-controls" data-testid="search-controls">
        <input
          className="search-input"
          placeholder="Search Markdown and metadata"
          value={query}
          onInput={event => setQuery(event.currentTarget.value)}
        />
        <div className="filter-row">
          <label>
            <span>Tag</span>
            <input placeholder="product" value={tag} onInput={event => setTag(event.currentTarget.value)} />
          </label>
          <label>
            <span>Type</span>
            <select value={objectTypeFilter} onChange={event => setObjectTypeFilter(event.currentTarget.value)}>
              <option value="">Any</option>
              <option value="Project">Project</option>
              <option value="Person">Person</option>
              <option value="Book">Book</option>
              <option value="CodeModule">CodeModule</option>
            </select>
          </label>
          <label>
            <span>Property</span>
            <input
              placeholder="status"
              value={propertyKey}
              onInput={event => setPropertyKey(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Value</span>
            <input
              placeholder="active"
              value={propertyValue}
              onInput={event => setPropertyValue(event.currentTarget.value)}
            />
          </label>
        </div>
      </section>
      <div className="result-list">
        {(results.data ?? []).map(result => (
          <Link key={result.id} className="result-card" to="/notes/$noteId" params={{ noteId: result.id }}>
            <strong>{result.title}</strong>
            <span>{result.snippet}</span>
            <div className="result-meta">
              <span>{result.pathHint}</span>
              {result.metadata?.type ? <span className="chip">{result.metadata.type}</span> : null}
              {(result.metadata?.tags ?? []).map(item => (
                <span key={item} className="chip">
                  #{item}
                </span>
              ))}
              <small>{result.matchedFields.join(', ')}</small>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
