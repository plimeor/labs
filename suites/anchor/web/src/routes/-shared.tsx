import type { NoteRecord } from '../domain/types'

export function RouteLoading(props: { label: string }) {
  return <div class="route-loading">{props.label}</div>
}

export function requireNoteId(note: NoteRecord | undefined): string {
  if (!note) {
    throw new Error('note_not_selected')
  }

  return note.metadata.id
}

export function formatRecordMap(record: Record<string, string>): string {
  const entries = Object.entries(record)
  if (entries.length === 0) {
    return 'none'
  }

  return entries.map(([key, value]) => `${key}:${value}`).join(', ')
}
