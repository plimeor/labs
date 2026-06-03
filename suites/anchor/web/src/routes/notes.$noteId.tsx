import { Editor } from '@plimeor/anchor-editor'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { CircleAlert, FilePlus } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { NoteRecord } from '../domain/types'
import { useAnchor } from '../lib/anchor-context'
import { RouteLoading } from './-shared'

export const Route = createFileRoute('/notes/$noteId')({
  component: NoteRoute
})

function NoteRoute() {
  const params = useParams({ strict: false })
  const anchor = useAnchor()
  const noteId = params.noteId
  const note = useQuery({
    queryKey: ['note', anchor.vaultRevision, noteId],
    queryFn: () => {
      if (!noteId) {
        throw new Error('note_not_selected')
      }

      return anchor.backend.readNote(noteId)
    }
  })

  const data = note.data
  const { selectNote } = anchor

  useEffect(() => {
    if (data) {
      selectNote(data)
    }
  }, [data, selectNote])

  if (!data) {
    return <RouteLoading label="Opening note" />
  }

  return <NoteEditor note={data} />
}

export function NoteEditor(props: { note: NoteRecord }) {
  const anchor = useAnchor()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [conflict, setConflict] = useState<string>()
  const createNote = useMutation({
    mutationFn: () => anchor.backend.createNote({ body: '', title: 'Untitled' }),
    onSuccess: note => {
      anchor.selectNote(note)
      queryClient.setQueryData(['note', anchor.vaultRevision, note.metadata.id], note)
      void queryClient.invalidateQueries()
      void navigate({ params: { noteId: note.metadata.id }, to: '/notes/$noteId' })
    }
  })

  const syncCurrentNoteQueries = (updated: NoteRecord) => {
    const revision = anchor.vaultRevision
    queryClient.setQueryData(['note', revision, updated.metadata.id], updated)

    if (updated.metadata.kind === 'journal') {
      queryClient.setQueryData(['today', revision], updated)
    }
  }

  const refreshRelationQueries = (noteId: string) => {
    const revision = anchor.vaultRevision
    const queryKeys = [
      ['graph', revision, noteId, 2],
      ['graph-inspector', revision, noteId],
      ['links', revision, noteId],
      ['backlinks', revision, noteId],
      ['unlinked-mentions', revision, noteId]
    ]
    for (const queryKey of queryKeys) {
      void queryClient.invalidateQueries({ exact: true, queryKey })
    }
  }

  const refreshMetadataQueries = (noteId: string) => {
    refreshRelationQueries(noteId)
    void queryClient.invalidateQueries({ exact: true, queryKey: ['notes', anchor.vaultRevision] })
    void queryClient.invalidateQueries({ queryKey: ['search'] })
  }

  const openWikilink = async (target: string) => {
    const normalizedTarget = target.trim().toLowerCase()
    if (!normalizedTarget) {
      return
    }

    const results = await anchor.backend.searchNotes({
      fields: ['id', 'title', 'metadata'],
      limit: 20,
      query: target,
      scope: { kind: 'all' }
    })
    const match = results.find(result => {
      if (result.title.toLowerCase() === normalizedTarget) {
        return true
      }

      return result.metadata?.aliases.some(alias => alias.toLowerCase() === normalizedTarget) ?? false
    })

    if (!match) {
      throw new Error(`No note found for [[${target}]]`)
    }

    await navigate({ params: { noteId: match.id }, to: '/notes/$noteId' })
  }

  return (
    <div className="note-route" data-testid="note-route">
      <header className="route-header">
        <div>
          <p>{props.note.metadata.kind}</p>
          <h1>{props.note.metadata.title}</h1>
        </div>
        <button className="icon-action" data-testid="create-note" type="button" onClick={() => createNote.mutate()}>
          <FilePlus size={16} />
          <span>New Note</span>
        </button>
      </header>
      {conflict ? (
        <div className="inline-error note-conflict-banner">
          <CircleAlert size={14} />
          <span>{conflict}</span>
        </div>
      ) : null}
      <div className="note-workspace">
        <Editor
          baseRevision={props.note.revision}
          body={props.note.body}
          noteId={props.note.metadata.id}
          onDirtyChange={dirty =>
            dirty ? anchor.markDirty(props.note.metadata.id) : anchor.markClean(props.note.metadata.id)
          }
          onAutosave={async (body, baseRevision) => {
            setConflict(undefined)
            try {
              const bodyUpdated = await anchor.backend.updateNote({
                baseRevision,
                body,
                noteId: props.note.metadata.id
              })
              const titleFromBody = firstMarkdownHeading(bodyUpdated.body)
              const updated =
                bodyUpdated.metadata.title === 'Untitled' && titleFromBody
                  ? await anchor.backend.updateNote({
                      baseRevision: bodyUpdated.revision,
                      metadataPatch: { title: titleFromBody },
                      noteId: bodyUpdated.metadata.id
                    })
                  : bodyUpdated
              anchor.selectNote(updated)
              syncCurrentNoteQueries(updated)
              anchor.markClean(updated.metadata.id)
              if (updated.metadata.title !== bodyUpdated.metadata.title) {
                refreshMetadataQueries(updated.metadata.id)
              } else {
                refreshRelationQueries(updated.metadata.id)
              }
              return { body: updated.body, revision: updated.revision }
            } catch (error) {
              setConflict(error instanceof Error ? error.message : String(error))
              throw error
            }
          }}
          onOpenWikilink={openWikilink}
        />
      </div>
    </div>
  )
}

function firstMarkdownHeading(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    const match = /^#\s+(.+)$/.exec(line.trim())
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return undefined
}
