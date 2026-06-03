import { useQuery } from '@tanstack/solid-query'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { createMemo, createSignal, For, Show } from 'solid-js'

import type { SearchRequest } from '../domain/types'
import { useAnchor } from '../lib/anchor-context'

export const Route = createFileRoute('/search')({
  component: SearchRoute
})

function SearchRoute() {
  const anchor = useAnchor()
  const [query, setQuery] = createSignal('Anchor')
  const [tag, setTag] = createSignal('')
  const [objectTypeFilter, setObjectTypeFilter] = createSignal('')
  const [propertyKey, setPropertyKey] = createSignal('')
  const [propertyValue, setPropertyValue] = createSignal('')
  const request = createMemo<SearchRequest>(() => {
    const nextRequest: SearchRequest = {
      fields: ['id', 'title', 'snippet', 'metadata'],
      limit: 20,
      query: query(),
      scope: { kind: 'all' }
    }
    const trimmedTag = tag().trim()
    const trimmedType = objectTypeFilter().trim()
    const trimmedPropertyKey = propertyKey().trim()
    const trimmedPropertyValue = propertyValue().trim()

    if (trimmedTag) nextRequest.tag = trimmedTag
    if (trimmedType) nextRequest.type = trimmedType
    if (trimmedPropertyKey) nextRequest.propertyKey = trimmedPropertyKey
    if (trimmedPropertyValue) nextRequest.propertyValue = trimmedPropertyValue

    return nextRequest
  })
  const results = useQuery(() => ({
    queryKey: ['search', anchor.vaultRevision(), request()],
    queryFn: () => anchor.backend.searchNotes(request())
  }))

  return (
    <div class="route-stack" data-testid="search-route">
      <header class="route-header">
        <div>
          <p>Search</p>
          <h1>Markdown and metadata</h1>
        </div>
      </header>
      <section class="search-controls" data-testid="search-controls">
        <input
          class="search-input"
          placeholder="Search Markdown and metadata"
          value={query()}
          onInput={event => setQuery(event.currentTarget.value)}
        />
        <div class="filter-row">
          <label>
            <span>Tag</span>
            <input placeholder="product" value={tag()} onInput={event => setTag(event.currentTarget.value)} />
          </label>
          <label>
            <span>Type</span>
            <select value={objectTypeFilter()} onChange={event => setObjectTypeFilter(event.currentTarget.value)}>
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
              value={propertyKey()}
              onInput={event => setPropertyKey(event.currentTarget.value)}
            />
          </label>
          <label>
            <span>Value</span>
            <input
              placeholder="active"
              value={propertyValue()}
              onInput={event => setPropertyValue(event.currentTarget.value)}
            />
          </label>
        </div>
      </section>
      <div class="result-list">
        <For each={results.data ?? []}>
          {result => (
            <Link class="result-card" to="/notes/$noteId" params={{ noteId: result.id }}>
              <strong>{result.title}</strong>
              <span>{result.snippet}</span>
              <div class="result-meta">
                <span>{result.pathHint}</span>
                <Show when={result.metadata?.type}>
                  <span class="chip">{result.metadata?.type}</span>
                </Show>
                <For each={result.metadata?.tags ?? []}>{item => <span class="chip">#{item}</span>}</For>
                <small>{result.matchedFields.join(', ')}</small>
              </div>
            </Link>
          )}
        </For>
      </div>
    </div>
  )
}
