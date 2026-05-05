#!/usr/bin/env bun

import { defineCli, defineCommand } from '@plimeor/command-kit'
import { toStandardJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'

import { BearNoteGateway } from './bear-adapter'

const optionalBoolean = (description: string) => v.optional(v.pipe(v.boolean(), v.description(description)))
const optionalString = (description: string) => v.optional(v.pipe(v.string(), v.description(description)))
const optionalStringArray = (description: string) => v.optional(v.pipe(v.array(v.string()), v.description(description)))
const optionalPositiveInteger = (description: string) =>
  v.optional(v.pipe(v.string(), v.description(description), v.transform(Number), v.integer(), v.minValue(1)))
const optionalNonNegativeInteger = (description: string) =>
  v.optional(v.pipe(v.string(), v.description(description), v.transform(Number), v.integer(), v.minValue(0)))

const searchArgsSchema = v.object({
  text: v.optional(v.string())
})

const searchOptionsSchema = v.object({
  excludedTag: optionalStringArray('Tags that matching notes must not have'),
  json: optionalBoolean('Write a JSON result envelope'),
  limit: optionalPositiveInteger('Maximum number of note summaries to return'),
  location: v.optional(v.picklist(['notes', 'trash', 'archive', 'all']), 'notes'),
  noteId: optionalStringArray('Restrict results to one or more note ids'),
  offset: optionalNonNegativeInteger('Number of matching notes to skip'),
  queryPrefix: optionalString('Search prefix applied before the query text'),
  requiredTag: optionalStringArray('Tags that every matching note must have'),
  sort: v.optional(v.string(), 'pinned,modified')
})

const getArgsSchema = v.object({
  noteId: v.string()
})

const getOptionsSchema = v.object({
  excludedTag: optionalStringArray('Tags that the target note must not have'),
  json: optionalBoolean('Write a JSON result envelope'),
  requiredTag: optionalStringArray('Tags that the target note must have')
})

type SearchContext = {
  args: v.InferOutput<typeof searchArgsSchema>
  options: v.InferOutput<typeof searchOptionsSchema>
}

type GetContext = {
  args: v.InferOutput<typeof getArgsSchema>
  options: v.InferOutput<typeof getOptionsSchema>
}

export function createCli() {
  return defineCli({
    description: 'Readonly CLI for querying notes through note-gateway adapters',
    name: 'note-gateway',
    schemaAdapter: { toStandardJsonSchema },
    commands: [
      defineCommand('search', {
        argBindings: [{ name: 'text', optional: true }],
        args: searchArgsSchema,
        description: 'Search notes and return note summaries',
        options: searchOptionsSchema,
        run: searchCommand
      }),
      defineCommand('get', {
        argBindings: [{ name: 'noteId' }],
        args: getArgsSchema,
        description: 'Read one note by id',
        options: getOptionsSchema,
        run: getCommand
      })
    ]
  })
}

async function searchCommand(context: SearchContext) {
  const gateway = new BearNoteGateway({
    excludedTags: context.options.excludedTag,
    noteIds: context.options.noteId,
    queryPrefix: context.options.queryPrefix,
    requiredTags: context.options.requiredTag
  })
  const rows = await gateway.search({
    excludedTags: context.options.excludedTag,
    limit: context.options.limit ?? 20,
    location: context.options.location,
    noteIds: context.options.noteId,
    offset: context.options.offset ?? 0,
    requiredTags: context.options.requiredTag,
    sort: context.options.sort,
    text: context.args.text
  })

  if (!context.options.json) {
    process.stdout.write(`${formatSummaries(rows)}\n`)
  }
  return rows
}

async function getCommand(context: GetContext) {
  const gateway = new BearNoteGateway({
    excludedTags: context.options.excludedTag,
    requiredTags: context.options.requiredTag
  })
  const note = await gateway.get(context.args.noteId)

  if (!context.options.json) {
    process.stdout.write(`${note.content}\n`)
  }
  return note
}

function formatSummaries(rows: Array<{ id: string; modifiedAt: string; tags: string[]; title: string }>): string {
  if (rows.length === 0) {
    return 'No notes found.'
  }

  return rows
    .map(row => {
      const tags = row.tags.length > 0 ? ` #${row.tags.join(' #')}` : ''
      return `${row.id}\t${row.modifiedAt}\t${row.title}${tags}`
    })
    .join('\n')
}

if (import.meta.main) {
  await createCli().serve(process.argv.slice(2))
}
