import { complexMarkdownStressNote, Editor } from '@plimeor/anchor-editor'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef, useState } from 'react'

export const Route = createFileRoute('/playground')({
  component: PlaygroundRoute
})

type PlaygroundSaveMode = 'conflict' | 'fail-once' | 'normal' | 'slow'

interface PlaygroundSample {
  body: string
  id: string
  label: string
}

interface PlaygroundEvent {
  body?: string
  detail: string
  id: number
  tone: 'error' | 'info' | 'success'
}

function PlaygroundRoute() {
  const [activeSampleId, setActiveSampleId] = useState(editorPlaygroundSamples[0].id)
  const [body, setBody] = useState(editorPlaygroundSamples[0].body)
  const [events, setEvents] = useState<PlaygroundEvent[]>([
    { detail: 'Loaded combined Markdown sample', id: 1, tone: 'info' }
  ])
  // Monotonic id for React keys: several events can be appended within the same
  // millisecond (e.g. autosave request + result), so Date.now() is not unique.
  const nextEventId = useRef(1)
  const [noteSession, setNoteSession] = useState(1)
  const [revision, setRevision] = useState('playground-1')
  const [saveMode, setSaveMode] = useState<PlaygroundSaveMode>('normal')
  const selectedSample = useMemo(
    () => editorPlaygroundSamples.find(sample => sample.id === activeSampleId) ?? editorPlaygroundSamples[0],
    [activeSampleId]
  )

  const appendEvent = (detail: string, tone: PlaygroundEvent['tone'], nextBody?: string) => {
    nextEventId.current += 1
    const id = nextEventId.current
    setEvents(items => [{ body: nextBody, detail, id, tone }, ...items].slice(0, 8))
  }

  const loadSample = () => {
    const sample = selectedSample
    const nextSession = noteSession + 1
    setBody(sample.body)
    setNoteSession(nextSession)
    setRevision(`playground-${nextSession}`)
    setSaveMode('normal')
    appendEvent(`Loaded ${sample.label}`, 'info')
  }

  const handleAutosave = async (
    nextBody: string,
    baseRevision: string
  ): Promise<{ body: string; revision: string }> => {
    appendEvent(`Autosave requested from ${baseRevision}`, 'info', nextBody)

    if (saveMode === 'slow') {
      await delay(900)
    }

    if (saveMode === 'conflict') {
      appendEvent('Rejected as conflict', 'error')
      throw new Error('conflict: playground forced stale base revision')
    }

    if (saveMode === 'fail-once') {
      setSaveMode('normal')
      appendEvent('Rejected once', 'error')
      throw new Error('playground forced save failure')
    }

    const nextRevision = `playground-${noteSession}-${Date.now()}`
    setBody(nextBody)
    setRevision(nextRevision)
    appendEvent(`Saved ${nextRevision}`, 'success', nextBody)
    return { body: nextBody, revision: nextRevision }
  }

  const handleOpenWikilink = (target: string) => {
    appendEvent(`Open wikilink [[${target}]]`, 'info')
  }

  return (
    <div className="playground-route" data-testid="playground-route">
      <header className="route-header">
        <div>
          <p>Playground</p>
          <h1>Editor manual verification</h1>
        </div>
        <div className="playground-header-actions">
          <button className="secondary-action" data-testid="load-sample" type="button" onClick={loadSample}>
            Load sample
          </button>
        </div>
      </header>

      <div className="playground-grid">
        <section className="playground-editor">
          <Editor
            key={noteSession}
            baseRevision={revision}
            body={body}
            noteId={`playground-${noteSession}`}
            onAutosave={handleAutosave}
            onDirtyChange={() => {}}
            onOpenWikilink={handleOpenWikilink}
          />
        </section>

        <aside className="playground-panel">
          <label>
            <span>Sample</span>
            <select value={activeSampleId} onChange={event => setActiveSampleId(event.currentTarget.value)}>
              {editorPlaygroundSamples.map(sample => (
                <option key={sample.id} value={sample.id}>
                  {sample.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Save mode</span>
            <select value={saveMode} onChange={event => setSaveMode(event.currentTarget.value as PlaygroundSaveMode)}>
              <option value="normal">Normal</option>
              <option value="slow">Slow</option>
              <option value="fail-once">Fail once</option>
              <option value="conflict">Conflict</option>
            </select>
          </label>

          <section className="playground-saved">
            <h2>Saved Markdown</h2>
            <pre>{body}</pre>
          </section>

          <section className="playground-events">
            <h2>Events</h2>
            {events.map(event => (
              <article key={event.id} className={eventToneClassName(event.tone)}>
                <strong>{event.detail}</strong>
                {event.body ? <pre>{event.body}</pre> : null}
              </article>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}

const editorPlaygroundSamples: PlaygroundSample[] = [
  {
    body: [
      '## Editor checks',
      '',
      '- [x] Review [Anchor](https://example.com) with [[Anchor V1]] #markdown',
      '- [ ] Fix **bold bug** in `serializeMarkdown`',
      '',
      '> See [docs](https://example.com) and `inline code` #editor',
      '',
      '```ts',
      'const value = 1',
      '```'
    ].join('\n'),
    id: 'combined',
    label: 'Combined Markdown'
  },
  {
    body: '| A | B |\n| --- | --- |\n| one | two |',
    id: 'unsupported-table',
    label: 'Unsupported table'
  },
  {
    body: '# Slash command surface\n\n\n',
    id: 'slash',
    label: 'Slash commands'
  },
  {
    body: '[[Kent Beck]] #notes [External](https://example.com)\n\n- [ ] one character at a time',
    id: 'tokens',
    label: 'Tokens and links'
  },
  {
    body: complexMarkdownStressNote,
    id: 'stress',
    label: 'Stress note'
  }
]

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function eventToneClassName(tone: PlaygroundEvent['tone']): string | undefined {
  if (tone === 'error') {
    return 'error'
  }

  if (tone === 'success') {
    return 'success'
  }

  return undefined
}
