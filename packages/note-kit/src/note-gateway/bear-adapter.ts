import { Bear } from '@plimeor/bear-sdk'
import * as v from 'valibot'

import {
  type AddWikilinkInput,
  AddWikilinkInputSchema,
  type AppendNoteInput,
  AppendNoteInputSchema,
  assertCreateAllowedByScope,
  assertNoteInScope,
  type CreateNoteInput,
  CreateNoteInputSchema,
  mergeSearchScope,
  type Note,
  NoteGateway,
  type NoteId,
  NoteIdSchema,
  type NoteMutationResult,
  type NoteRef,
  type NoteSearchQuery,
  type NoteSearchQueryInput,
  NoteSearchQuerySchema,
  type NoteSummary,
  normalizeTag,
  type ReplaceNoteContentInput,
  ReplaceNoteContentInputSchema,
  type UpdateNoteTagsInput,
  UpdateNoteTagsInputSchema,
  uniqueTags
} from './core.js'

export class BearNoteGateway extends NoteGateway {
  public override async search(query: NoteSearchQueryInput = {}): Promise<NoteSummary[]> {
    const parsedQuery = v.parse(NoteSearchQuerySchema, query)
    const scopedQuery = mergeSearchScope(this.scope, parsedQuery)
    const requestedIds = scopedQuery.noteIds ? new Set(scopedQuery.noteIds) : undefined

    if (requestedIds) {
      if (buildBearSearchQuery(scopedQuery).length > 0) {
        const rows = await Bear.search(buildBearSearchQuery(scopedQuery), {
          location: scopedQuery.location,
          sort: scopedQuery.sort
        })
        return pageSummaries(rows.filter(row => requestedIds.has(row.id)).map(bearMetadataToSummary), scopedQuery)
      }

      const notes = await Promise.all([...requestedIds].map(id => this.get(id)))
      return pageSummaries(
        notes.filter(note => isInRequestedLocation(note, scopedQuery.location)).map(noteToSummary),
        scopedQuery
      )
    }

    const bearQuery = buildBearSearchQuery(scopedQuery)
    const rows = await (bearQuery.trim().length > 0
      ? Bear.search(bearQuery, {
          limit: scopedQuery.limit,
          location: scopedQuery.location,
          offset: scopedQuery.offset,
          sort: scopedQuery.sort
        })
      : Bear.list({
          limit: scopedQuery.limit,
          location: scopedQuery.location,
          offset: scopedQuery.offset,
          sort: scopedQuery.sort
        }))
    return rows.map(bearMetadataToSummary)
  }

  public override async get(noteId: NoteId): Promise<Note> {
    const id = v.parse(NoteIdSchema, noteId)
    const row = await Bear.show({ id }, { includeContent: true })
    const note = bearNoteToNote(row)
    assertNoteInScope(note, this.scope)
    return note
  }

  public override async createNote(input: CreateNoteInput): Promise<NoteRef> {
    const parsedInput = v.parse(CreateNoteInputSchema, input)
    assertCreateAllowedByScope(this.scope, parsedInput.tags)
    const tags = uniqueTags([...this.scope.requiredTags, ...parsedInput.tags])
    const row = await Bear.create({
      content: parsedInput.content,
      tags,
      title: parsedInput.title
    })
    const summary = bearMetadataToSummary(row)
    assertNoteInScope(summary, this.scope)
    return summary
  }

  public override async appendNote(input: AppendNoteInput): Promise<NoteMutationResult> {
    const parsedInput = v.parse(AppendNoteInputSchema, input)
    const before = await this.get(parsedInput.noteId)
    await Bear.append(
      { id: parsedInput.noteId },
      {
        content: parsedInput.content,
        position: parsedInput.position
      }
    )
    const after = await this.get(parsedInput.noteId)
    return mutationResult(before, after)
  }

  public override async replaceNoteContent(input: ReplaceNoteContentInput): Promise<NoteMutationResult> {
    const parsedInput = v.parse(ReplaceNoteContentInputSchema, input)
    const before = await this.get(parsedInput.noteId)
    await Bear.overwrite(
      { id: parsedInput.noteId },
      {
        base: before.hash,
        content: parsedInput.content
      }
    )
    const afterWrite = bearNoteToNote(await Bear.show({ id: parsedInput.noteId }, { includeContent: true }))
    const missingTags = before.tags.filter(tag => !afterWrite.tags.includes(tag))
    if (missingTags.length > 0) {
      await Bear.addTags({ id: parsedInput.noteId }, { tags: missingTags })
    }
    const after = await this.get(parsedInput.noteId)
    return mutationResult(before, after)
  }

  public override async updateNoteTags(input: UpdateNoteTagsInput): Promise<NoteMutationResult> {
    const parsedInput = v.parse(UpdateNoteTagsInputSchema, input)
    const before = await this.get(parsedInput.noteId)
    const add = uniqueTags(parsedInput.add)
    const remove = uniqueTags(parsedInput.remove)

    for (const tag of add) {
      if (this.scope.excludedTags.includes(tag)) {
        throw new Error(`Tag is excluded by scope: ${tag}`)
      }
      await Bear.addTags(
        { id: parsedInput.noteId },
        {
          tags: [tag]
        }
      )
    }

    for (const tag of remove) {
      if (this.scope.requiredTags.includes(tag)) {
        throw new Error(`Cannot remove required scope tag: ${tag}`)
      }
      await Bear.removeTags(
        { id: parsedInput.noteId },
        {
          tags: [tag]
        }
      )
    }

    const after = await this.get(parsedInput.noteId)
    return mutationResult(before, after)
  }

  public override async addWikilink(input: AddWikilinkInput): Promise<NoteMutationResult> {
    const parsedInput = v.parse(AddWikilinkInputSchema, input)
    const before = await this.get(parsedInput.noteId)
    const edit = buildWikilinkEdit(
      before.content,
      parsedInput.mention,
      wikilinkReplacement(parsedInput.wikiTitle, parsedInput.alias),
      parsedInput.all,
      parsedInput.wholeWord
    )
    await Bear.edit(
      { id: parsedInput.noteId },
      {
        all: edit.all,
        find: edit.find,
        replace: edit.replace,
        word: edit.word
      }
    )
    const after = await this.get(parsedInput.noteId)
    return mutationResult(before, after)
  }
}

function pageSummaries(summaries: NoteSummary[], query: Pick<NoteSearchQuery, 'offset' | 'limit'>): NoteSummary[] {
  return summaries.slice(query.offset, query.offset + query.limit)
}

function isInRequestedLocation(note: NoteSummary, location: NoteSearchQuery['location']): boolean {
  return location === 'all' || note.location === location
}

function buildBearSearchQuery(query: NoteSearchQuery): string {
  return [
    query.text,
    ...query.requiredTags.map(formatBearSearchTag),
    ...query.excludedTags.map(tag => `-${formatBearSearchTag(tag)}`)
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function formatBearSearchTag(tag: string): string {
  const normalized = normalizeTag(tag)
  return /\s/.test(normalized) ? `#${normalized}#` : `#${normalized}`
}

function bearMetadataToSummary(row: Bear.NoteMetadata): NoteSummary {
  return {
    createdAt: row.created,
    hash: row.hash,
    id: row.id,
    location: row.location,
    modifiedAt: row.modified,
    tags: uniqueTags(row.tags),
    title: row.title
  }
}

function bearNoteToNote(row: Bear.Note): Note {
  return {
    ...bearMetadataToSummary(row),
    content: row.content ?? ''
  }
}

function noteToSummary(note: Note): NoteSummary {
  const { content: _content, ...summary } = note
  return summary
}

function mutationResult(before: Note, after: Note): NoteMutationResult {
  return {
    currentHash: after.hash,
    followUpRead: true,
    noteId: after.id,
    previousHash: before.hash
  }
}

function buildWikilinkEdit(
  content: string,
  mention: string,
  replacement: string,
  all: boolean,
  wholeWord: boolean
): Pick<Bear.EditOptions, 'find' | 'replace' | 'all' | 'word'> {
  const matches = [...content.matchAll(mentionRegex(mention, wholeWord))]
  if (matches.length === 0) {
    throw new Error(`Mention not found: ${mention}`)
  }

  const targetMatches = all ? matches : matches.slice(0, 1)
  const unsafeRanges = unsafeMarkdownRanges(content)
  for (const match of targetMatches) {
    const index = match.index
    if (index === undefined) continue
    if (rangeContains(unsafeRanges, index)) {
      throw new Error(`Mention is inside frontmatter, code, or an existing wikilink: ${mention}`)
    }
  }

  if (all) {
    return {
      all: true,
      find: mention,
      replace: replacement,
      word: shouldUseWordBoundary(mention, wholeWord)
    }
  }

  const targetIndex = matches[0]?.index
  if (targetIndex === undefined) {
    throw new Error(`Mention not found: ${mention}`)
  }

  const context = uniqueEditContext(content, targetIndex, mention.length)
  return {
    find: context.find,
    replace:
      context.find.slice(0, context.relativeIndex) +
      replacement +
      context.find.slice(context.relativeIndex + mention.length)
  }
}

function wikilinkReplacement(wikiTitle: string, alias: string | undefined): string {
  return alias ? `[[${wikiTitle}|${alias}]]` : `[[${wikiTitle}]]`
}

function mentionRegex(mention: string, wholeWord: boolean): RegExp {
  const escaped = escapeRegExp(mention)
  const useWordBoundary = shouldUseWordBoundary(mention, wholeWord)
  const pattern = useWordBoundary ? `\\b${escaped}\\b` : escaped
  return new RegExp(pattern, 'g')
}

function shouldUseWordBoundary(mention: string, wholeWord: boolean): boolean {
  return wholeWord && /^[A-Za-z0-9_]+$/.test(mention)
}

function unsafeMarkdownRanges(content: string): Array<{ start: number; end: number }> {
  return [...frontmatterRanges(content), ...fencedCodeRanges(content), ...wikilinkRanges(content)]
}

function frontmatterRanges(content: string): Array<{ start: number; end: number }> {
  const match = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(content)
  return match ? [{ end: match[0].length, start: 0 }] : []
}

function fencedCodeRanges(content: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  const regex = /^```[\s\S]*?^```[ \t]*(?:\n|$)/gm
  for (const match of content.matchAll(regex)) {
    if (match.index !== undefined) {
      ranges.push({ end: match.index + match[0].length, start: match.index })
    }
  }
  return ranges
}

function wikilinkRanges(content: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  const regex = /\[\[[^\]]+?\]\]/g
  for (const match of content.matchAll(regex)) {
    if (match.index !== undefined) {
      ranges.push({ end: match.index + match[0].length, start: match.index })
    }
  }
  return ranges
}

function rangeContains(ranges: Array<{ start: number; end: number }>, index: number): boolean {
  return ranges.some(range => index >= range.start && index < range.end)
}

function uniqueEditContext(
  content: string,
  index: number,
  length: number
): { find: Bear.EditOptions['find']; relativeIndex: number } {
  let start = lineStartBefore(content, index)
  let end = lineEndAfter(content, index + length)

  while (countOccurrences(content, content.slice(start, end)) > 1) {
    const nextStart = previousLineStart(content, start)
    const nextEnd = nextLineEnd(content, end)
    if (nextStart === start && nextEnd === end) {
      throw new Error('Cannot build a unique Bear.edit context for wikilink insertion.')
    }
    start = nextStart
    end = nextEnd
  }

  return {
    find: content.slice(start, end),
    relativeIndex: index - start
  }
}

function lineStartBefore(content: string, index: number): number {
  const previousNewline = content.lastIndexOf('\n', Math.max(0, index - 1))
  return previousNewline === -1 ? 0 : previousNewline + 1
}

function lineEndAfter(content: string, index: number): number {
  const nextNewline = content.indexOf('\n', index)
  return nextNewline === -1 ? content.length : nextNewline + 1
}

function previousLineStart(content: string, start: number): number {
  if (start === 0) return 0
  const previousNewline = content.lastIndexOf('\n', start - 2)
  return previousNewline === -1 ? 0 : previousNewline + 1
}

function nextLineEnd(content: string, end: number): number {
  if (end >= content.length) return content.length
  const nextNewline = content.indexOf('\n', end)
  return nextNewline === -1 ? content.length : nextNewline + 1
}

function countOccurrences(content: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let index = 0
  while ((index = content.indexOf(needle, index)) !== -1) {
    count += 1
    index += needle.length
  }
  return count
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
