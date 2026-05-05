import { $ } from 'bun'

import * as v from 'valibot'

export namespace Bear {
  const DEFAULT_COMMANDS = ['bear', 'bearcli'] as const

  export const NoteLocationSchema = v.pipe(
    v.picklist(['notes', 'trash', 'archive', 'all']),
    v.description('Bear note collection to read from: active notes, trash, archive, or all locations.')
  )
  export type NoteLocation = v.InferOutput<typeof NoteLocationSchema>

  export const AppendPositionSchema = v.pipe(
    v.picklist(['beginning', 'end']),
    v.description('Where appended content should be inserted in the note.')
  )
  export type AppendPosition = v.InferOutput<typeof AppendPositionSchema>

  const PositiveIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(1))
  const NonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0))
  const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))
  const StringArraySchema = v.array(v.string())
  const LockedSchema = v.pipe(
    v.picklist(['no', 'yes']),
    v.description('Whether Bear reports the note as locked.'),
    v.transform(input => input === 'yes')
  )

  const RuntimeOptionsEntries = {
    command: v.optional(
      v.pipe(
        NonEmptyStringSchema,
        v.description('Bear CLI executable to run instead of auto-detecting bear or bearcli.')
      )
    ),
    cwd: v.optional(v.pipe(NonEmptyStringSchema, v.description('Working directory used when running the Bear CLI.'))),
    env: v.optional(
      v.pipe(
        v.record(v.string(), v.optional(v.string())),
        v.description('Environment variables merged into the Bear CLI process environment.')
      )
    )
  }

  export const RuntimeOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries
  })
  export type RuntimeOptions = v.InferOutput<typeof RuntimeOptionsSchema>

  export const NoteTargetSchema = v.union([
    v.strictObject({ id: v.pipe(NonEmptyStringSchema, v.description('Stable Bear note identifier to target.')) }),
    v.strictObject({
      title: v.pipe(NonEmptyStringSchema, v.description('Bear note title to target when an id is not used.'))
    })
  ])
  export type NoteTarget = v.InferOutput<typeof NoteTargetSchema>

  export const ListOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    limit: v.optional(v.pipe(PositiveIntegerSchema, v.description('Maximum number of notes to return.'))),
    location: v.optional(NoteLocationSchema),
    offset: v.optional(
      v.pipe(NonNegativeIntegerSchema, v.description('Number of notes to skip before returning results.'))
    ),
    sort: v.optional(
      v.pipe(NonEmptyStringSchema, v.description('Bear CLI sort expression for ordering list results.'))
    ),
    tag: v.optional(v.pipe(NonEmptyStringSchema, v.description('Restrict listed notes to a single Bear tag.')))
  })
  export type ListOptions = v.InferOutput<typeof ListOptionsSchema>

  export const SearchOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    limit: v.optional(v.pipe(PositiveIntegerSchema, v.description('Maximum number of matching notes to return.'))),
    location: v.optional(NoteLocationSchema),
    offset: v.optional(
      v.pipe(NonNegativeIntegerSchema, v.description('Number of matching notes to skip before returning results.'))
    ),
    sort: v.optional(
      v.pipe(NonEmptyStringSchema, v.description('Bear CLI sort expression for ordering search results.'))
    )
  })
  export type SearchOptions = v.InferOutput<typeof SearchOptionsSchema>

  export const ShowOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    includeContent: v.optional(v.pipe(v.boolean(), v.description('Include the note body in addition to metadata.')))
  })
  export type ShowOptions = v.InferOutput<typeof ShowOptionsSchema>

  export const CatOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    limit: v.optional(v.pipe(PositiveIntegerSchema, v.description('Maximum number of content characters to return.'))),
    offset: v.optional(
      v.pipe(NonNegativeIntegerSchema, v.description('Number of content characters to skip before reading.'))
    )
  })
  export type CatOptions = v.InferOutput<typeof CatOptionsSchema>

  export const SearchInOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    context: v.optional(
      v.pipe(PositiveIntegerSchema, v.description('Number of surrounding characters to include around each match.'))
    ),
    limit: v.optional(v.pipe(PositiveIntegerSchema, v.description('Maximum number of in-note matches to return.'))),
    string: v.pipe(NonEmptyStringSchema, v.description('Text to search for inside the target note.'))
  })
  export type SearchInOptions = v.InferOutput<typeof SearchInOptionsSchema>

  export const CreateOptionsSchema = v.pipe(
    v.strictObject({
      ...RuntimeOptionsEntries,
      content: v.optional(v.pipe(v.string(), v.description('Initial Markdown content for the new Bear note.'))),
      ifNotExists: v.optional(
        v.pipe(v.boolean(), v.description('Create the note only when no note with the requested title already exists.'))
      ),
      tags: v.optional(v.pipe(v.array(NonEmptyStringSchema), v.description('Bear tags to assign to the new note.'))),
      title: v.optional(v.pipe(NonEmptyStringSchema, v.description('Title for the new Bear note.')))
    }),
    v.check(input => Boolean(input.title ?? input.content), 'Create requires a title or content'),
    v.check(input => !input.ifNotExists || Boolean(input.title), 'ifNotExists requires a title')
  )
  export type CreateOptions = v.InferOutput<typeof CreateOptionsSchema>

  export const AppendOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    content: v.pipe(v.string(), v.description('Markdown content to append to the target note.')),
    position: v.optional(AppendPositionSchema),
    preserveModified: v.optional(
      v.pipe(v.boolean(), v.description("Keep the note's modified timestamp unchanged when Bear supports it."))
    )
  })
  export type AppendOptions = v.InferOutput<typeof AppendOptionsSchema>

  export const EditOptionsSchema = v.pipe(
    v.strictObject({
      ...RuntimeOptionsEntries,
      all: v.optional(v.pipe(v.boolean(), v.description('Edit every match instead of only the first match.'))),
      find: v.pipe(NonEmptyStringSchema, v.description('Exact text to find before replacing or inserting content.')),
      ignoreCase: v.optional(v.pipe(v.boolean(), v.description('Match the edit target without case sensitivity.'))),
      insertAfter: v.optional(
        v.pipe(v.string(), v.description('Content to insert immediately after the matched text.'))
      ),
      insertBefore: v.optional(
        v.pipe(v.string(), v.description('Content to insert immediately before the matched text.'))
      ),
      preserveModified: v.optional(
        v.pipe(v.boolean(), v.description("Keep the note's modified timestamp unchanged when Bear supports it."))
      ),
      replace: v.optional(v.pipe(v.string(), v.description('Content that replaces the matched text.'))),
      word: v.optional(v.pipe(v.boolean(), v.description('Match only whole words when finding the edit target.')))
    }),
    v.check(input => {
      const operations = [input.insertAfter, input.insertBefore, input.replace].filter(value => value !== undefined)
      return operations.length === 1
    }, 'Edit requires exactly one of insertAfter, insertBefore, or replace')
  )
  export type EditOptions = v.InferOutput<typeof EditOptionsSchema>

  export const OverwriteOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    base: v.optional(
      v.pipe(NonEmptyStringSchema, v.description('Expected current note hash used as a conflict guard before writing.'))
    ),
    content: v.pipe(v.string(), v.description('Complete Markdown content to write into the target note.')),
    preserveModified: v.optional(
      v.pipe(v.boolean(), v.description("Keep the note's modified timestamp unchanged when Bear supports it."))
    )
  })
  export type OverwriteOptions = v.InferOutput<typeof OverwriteOptionsSchema>

  export const TagsOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    tags: v.pipe(
      v.array(NonEmptyStringSchema),
      v.minLength(1),
      v.description('Bear tags to add to or remove from the target note.')
    )
  })
  export type TagsOptions = v.InferOutput<typeof TagsOptionsSchema>

  export const PinsOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    targets: v.pipe(
      v.array(NonEmptyStringSchema),
      v.minLength(1),
      v.description('Bear pin targets to add to or remove from the note.')
    )
  })
  export type PinsOptions = v.InferOutput<typeof PinsOptionsSchema>

  export const RenameTagGloballyOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    force: v.optional(
      v.pipe(v.boolean(), v.description('Allow the rename even when Bear would otherwise require confirmation.'))
    ),
    from: v.pipe(NonEmptyStringSchema, v.description('Existing Bear tag name to rename.')),
    to: v.pipe(NonEmptyStringSchema, v.description('Replacement Bear tag name.'))
  })
  export type RenameTagGloballyOptions = v.InferOutput<typeof RenameTagGloballyOptionsSchema>

  export const DeleteTagGloballyOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    name: v.pipe(NonEmptyStringSchema, v.description('Bear tag name to delete globally.'))
  })
  export type DeleteTagGloballyOptions = v.InferOutput<typeof DeleteTagGloballyOptionsSchema>

  export const AttachmentListOptionsSchema = RuntimeOptionsSchema
  export type AttachmentListOptions = RuntimeOptions

  export const AttachmentDataSchema = v.pipe(
    v.union([v.instance(Uint8Array), v.instance(ArrayBuffer), v.string()]),
    v.description('Attachment payload passed to the Bear CLI through standard input.')
  )
  export type AttachmentData = v.InferOutput<typeof AttachmentDataSchema>

  export const AttachmentAddOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    data: AttachmentDataSchema,
    filename: v.pipe(NonEmptyStringSchema, v.description('Filename to assign to the attachment in Bear.')),
    preserveModified: v.optional(
      v.pipe(v.boolean(), v.description("Keep the note's modified timestamp unchanged when Bear supports it."))
    )
  })
  export type AttachmentAddOptions = v.InferOutput<typeof AttachmentAddOptionsSchema>

  export const AttachmentSaveOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    filename: v.pipe(NonEmptyStringSchema, v.description('Name of the attachment to read from the target note.'))
  })
  export type AttachmentSaveOptions = v.InferOutput<typeof AttachmentSaveOptionsSchema>

  export const AttachmentDeleteOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    filename: v.pipe(NonEmptyStringSchema, v.description('Name of the attachment to remove from the target note.')),
    preserveModified: v.optional(
      v.pipe(v.boolean(), v.description("Keep the note's modified timestamp unchanged when Bear supports it."))
    )
  })
  export type AttachmentDeleteOptions = v.InferOutput<typeof AttachmentDeleteOptionsSchema>

  export const MoveOptionsSchema = RuntimeOptionsSchema
  export type MoveOptions = RuntimeOptions

  export const OpenOptionsSchema = v.strictObject({
    ...RuntimeOptionsEntries,
    edit: v.optional(v.pipe(v.boolean(), v.description('Open the note directly in edit mode.'))),
    header: v.optional(v.pipe(NonEmptyStringSchema, v.description('Header inside the note to focus after opening.'))),
    newWindow: v.optional(v.pipe(v.boolean(), v.description('Open the note in a new Bear window.')))
  })
  export type OpenOptions = v.InferOutput<typeof OpenOptionsSchema>

  const NoteMetadataEntries = {
    attachments: v.pipe(StringArraySchema, v.description('Attachment filenames currently associated with the note.')),
    created: v.pipe(v.string(), v.description('Bear-created timestamp reported by the CLI.')),
    done: v.pipe(NonNegativeIntegerSchema, v.description('Number of completed todo items in the note.')),
    hash: v.pipe(v.string(), v.description('Bear content hash for optimistic write checks.')),
    id: v.pipe(v.string(), v.description('Stable Bear note identifier.')),
    length: v.pipe(NonNegativeIntegerSchema, v.description('Length of the note content reported by Bear.')),
    location: v.pipe(
      v.picklist(['notes', 'trash', 'archive']),
      v.description('Current Bear collection containing the note.')
    ),
    locked: LockedSchema,
    modified: v.pipe(v.string(), v.description('Bear-modified timestamp reported by the CLI.')),
    pins: v.pipe(StringArraySchema, v.description('Pin targets currently assigned to the note.')),
    tags: v.pipe(StringArraySchema, v.description('Bear tags currently assigned to the note.')),
    title: v.pipe(v.string(), v.description('Current Bear note title.')),
    todos: v.pipe(NonNegativeIntegerSchema, v.description('Total number of todo items in the note.'))
  }

  export const NoteMetadataSchema = v.strictObject(NoteMetadataEntries)
  export type NoteMetadata = v.InferOutput<typeof NoteMetadataSchema>

  export const SearchResultSchema = v.strictObject({
    ...NoteMetadataEntries,
    matches: v.pipe(v.number(), v.description('Number of query matches reported for this note.'))
  })
  export type SearchResult = v.InferOutput<typeof SearchResultSchema>

  export const NoteSchema = v.strictObject({
    ...NoteMetadataEntries,
    content: v.optional(
      v.pipe(v.string(), v.description('Markdown body included when the caller requests note content.'))
    )
  })
  export type Note = v.InferOutput<typeof NoteSchema>

  export const CreatedNoteSchema = NoteMetadataSchema
  export type CreatedNote = v.InferOutput<typeof CreatedNoteSchema>

  export const CatResultSchema = v.strictObject({
    content: v.pipe(v.string(), v.description('Markdown content returned by Bear cat.'))
  })

  export const CountResultSchema = v.strictObject({
    count: v.pipe(NonNegativeIntegerSchema, v.description('Number of notes or matches reported by Bear.'))
  })

  export const SearchInMatchSchema = v.strictObject({
    offset: v.pipe(NonNegativeIntegerSchema, v.description('Character offset of the match inside the target note.')),
    snippet: v.pipe(v.string(), v.description('Matched text with any requested surrounding context.'))
  })
  export type SearchInMatch = v.InferOutput<typeof SearchInMatchSchema>

  export const TagEntrySchema = v.strictObject({
    tag: v.pipe(v.string(), v.description('Bear tag name.'))
  })
  export type TagEntry = v.InferOutput<typeof TagEntrySchema>

  export const PinEntrySchema = v.strictObject({
    pin: v.pipe(v.string(), v.description('Bear pin target name.'))
  })
  export type PinEntry = v.InferOutput<typeof PinEntrySchema>

  export const AttachmentSchema = v.strictObject({
    filename: v.pipe(v.string(), v.description('Attachment filename stored on the note.')),
    size: v.pipe(NonNegativeIntegerSchema, v.description('Attachment size in bytes reported by Bear.'))
  })
  export type Attachment = v.InferOutput<typeof AttachmentSchema>

  export const SavedAttachmentSchema = v.strictObject({
    base64: v.pipe(v.string(), v.description('Base64-encoded attachment content returned by Bear.')),
    filename: v.pipe(v.string(), v.description('Attachment filename stored on the note.')),
    size: v.pipe(NonNegativeIntegerSchema, v.description('Attachment size in bytes reported by Bear.'))
  })
  export type SavedAttachment = v.InferOutput<typeof SavedAttachmentSchema>

  export async function list(options: ListOptions = {}): Promise<NoteMetadata[]> {
    const input = v.parse(ListOptionsSchema, options)
    const args = ['list', '--format', 'json', '--fields', 'all']
    appendListArgs(args, input)
    return runJson(args, v.array(NoteMetadataSchema), input)
  }

  export async function count(options: ListOptions = {}): Promise<number> {
    const input = v.parse(ListOptionsSchema, options)
    const args = ['list', '--count', '--format', 'json']
    appendListArgs(args, input)
    const result = await runJson(args, CountResultSchema, input)
    return result.count
  }

  export async function search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const parsedQuery = v.parse(NonEmptyStringSchema, query)
    const input = v.parse(SearchOptionsSchema, options)
    const args = ['search', '--query', parsedQuery, '--format', 'json', '--fields', 'all']
    appendSearchArgs(args, input)
    return runJson(args, v.array(SearchResultSchema), input)
  }

  export async function countSearch(query: string, options: SearchOptions = {}): Promise<number> {
    const parsedQuery = v.parse(NonEmptyStringSchema, query)
    const input = v.parse(SearchOptionsSchema, options)
    const args = ['search', '--query', parsedQuery, '--count', '--format', 'json']
    appendSearchArgs(args, input)
    const result = await runJson(args, CountResultSchema, input)
    return result.count
  }

  export async function show(target: NoteTarget, options: ShowOptions = {}): Promise<Note> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(ShowOptionsSchema, options)
    const fields = input.includeContent ? 'all,content' : 'all'
    const args = ['show']
    appendTargetArgs(args, parsedTarget)
    args.push('--format', 'json', '--fields', fields)
    return runJson(args, NoteSchema, input)
  }

  export async function cat(target: NoteTarget, options: CatOptions = {}): Promise<string> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(CatOptionsSchema, options)
    const args = ['cat']
    appendTargetArgs(args, parsedTarget)
    if (input.offset !== undefined) {
      args.push('--offset', String(input.offset))
    }
    if (input.limit !== undefined) {
      args.push('--limit', String(input.limit))
    }
    args.push('--format', 'json')
    const result = await runJson(args, CatResultSchema, input)
    return result.content
  }

  export async function searchIn(target: NoteTarget, options: SearchInOptions): Promise<SearchInMatch[]> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(SearchInOptionsSchema, options)
    const args = ['search-in']
    appendTargetArgs(args, parsedTarget)
    args.push('--string', input.string, '--format', 'json')
    if (input.context !== undefined) {
      args.push('--context', String(input.context))
    }
    if (input.limit !== undefined) {
      args.push('--limit', String(input.limit))
    }
    return runJson(args, v.array(SearchInMatchSchema), input)
  }

  export async function countIn(target: NoteTarget, options: SearchInOptions): Promise<number> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(SearchInOptionsSchema, options)
    const args = ['search-in']
    appendTargetArgs(args, parsedTarget)
    args.push('--string', input.string, '--count', '--format', 'json')
    const result = await runJson(args, CountResultSchema, input)
    return result.count
  }

  export async function create(options: CreateOptions): Promise<CreatedNote> {
    const input = v.parse(CreateOptionsSchema, options)
    const args = ['create']
    if (input.title) {
      args.push(input.title)
    }
    args.push('--content', input.content ?? '')
    if (input.tags?.length) {
      args.push('--tags', input.tags.join(','))
    }
    if (input.ifNotExists) {
      args.push('--if-not-exists')
    }
    args.push('--format', 'json', '--fields', 'all')
    return runJson(args, CreatedNoteSchema, input)
  }

  export async function append(target: NoteTarget, options: AppendOptions): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(AppendOptionsSchema, options)
    const args = ['append']
    appendTargetArgs(args, parsedTarget)
    args.push('--content', input.content)
    if (input.position) {
      args.push('--position', input.position)
    }
    appendPreserveModifiedArg(args, input.preserveModified)
    await runSuccess(args, input)
  }

  export async function edit(target: NoteTarget, options: EditOptions): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(EditOptionsSchema, options)
    const args = ['edit']
    appendTargetArgs(args, parsedTarget)
    args.push('--find', input.find)
    if (input.replace !== undefined) {
      args.push('--replace', input.replace)
    }
    if (input.insertAfter !== undefined) {
      args.push('--insert-after', input.insertAfter)
    }
    if (input.insertBefore !== undefined) {
      args.push('--insert-before', input.insertBefore)
    }
    appendBooleanArg(args, '--all', input.all)
    appendBooleanArg(args, '--ignore-case', input.ignoreCase)
    appendBooleanArg(args, '--word', input.word)
    appendPreserveModifiedArg(args, input.preserveModified)
    await runSuccess(args, input)
  }

  export async function overwrite(target: NoteTarget, options: OverwriteOptions): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(OverwriteOptionsSchema, options)
    const args = ['overwrite']
    appendTargetArgs(args, parsedTarget)
    args.push('--content', input.content)
    if (input.base) {
      args.push('--base', input.base)
    }
    appendPreserveModifiedArg(args, input.preserveModified)
    await runSuccess(args, input)
  }

  export async function listTags(target?: NoteTarget, options: RuntimeOptions = {}): Promise<TagEntry[]> {
    const input = v.parse(RuntimeOptionsSchema, options)
    const args = ['tags', 'list']
    if (target) {
      appendTargetArgs(args, v.parse(NoteTargetSchema, target))
    }
    args.push('--format', 'json', '--fields', 'tag')
    return runJson(args, v.array(TagEntrySchema), input)
  }

  export async function addTags(target: NoteTarget, options: TagsOptions): Promise<void> {
    await mutateTags('add', target, options)
  }

  export async function removeTags(target: NoteTarget, options: TagsOptions): Promise<void> {
    await mutateTags('remove', target, options)
  }

  export async function renameTagGlobally(options: RenameTagGloballyOptions): Promise<void> {
    const input = v.parse(RenameTagGloballyOptionsSchema, options)
    const args = ['tags', 'rename', '--from', input.from, '--to', input.to]
    appendBooleanArg(args, '--force', input.force)
    await runSuccess(args, input)
  }

  export async function deleteTagGlobally(options: DeleteTagGloballyOptions): Promise<void> {
    const input = v.parse(DeleteTagGloballyOptionsSchema, options)
    await runSuccess(['tags', 'delete', '--name', input.name], input)
  }

  export async function listPins(target?: NoteTarget, options: RuntimeOptions = {}): Promise<PinEntry[]> {
    const input = v.parse(RuntimeOptionsSchema, options)
    const args = ['pin', 'list']
    if (target) {
      appendTargetArgs(args, v.parse(NoteTargetSchema, target))
    }
    args.push('--format', 'json', '--fields', 'pin')
    return runJson(args, v.array(PinEntrySchema), input)
  }

  export async function addPins(target: NoteTarget, options: PinsOptions): Promise<void> {
    await mutatePins('add', target, options)
  }

  export async function removePins(target: NoteTarget, options: PinsOptions): Promise<void> {
    await mutatePins('remove', target, options)
  }

  export async function listAttachments(
    target: NoteTarget,
    options: AttachmentListOptions = {}
  ): Promise<Attachment[]> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(AttachmentListOptionsSchema, options)
    const args = ['attachments', 'list']
    appendTargetArgs(args, parsedTarget)
    args.push('--format', 'json', '--fields', 'filename,size')
    return runJson(args, v.array(AttachmentSchema), input)
  }

  export async function addAttachment(target: NoteTarget, options: AttachmentAddOptions): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(AttachmentAddOptionsSchema, options)
    const args = ['attachments', 'add']
    appendTargetArgs(args, parsedTarget)
    args.push('--filename', input.filename)
    appendPreserveModifiedArg(args, input.preserveModified)
    await runSuccess(args, input, input.data)
  }

  export async function saveAttachment(target: NoteTarget, options: AttachmentSaveOptions): Promise<SavedAttachment> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(AttachmentSaveOptionsSchema, options)
    const args = ['attachments', 'save']
    appendTargetArgs(args, parsedTarget)
    args.push('--filename', input.filename, '--format', 'json')
    return runJson(args, SavedAttachmentSchema, input)
  }

  export async function deleteAttachment(target: NoteTarget, options: AttachmentDeleteOptions): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(AttachmentDeleteOptionsSchema, options)
    const args = ['attachments', 'delete']
    appendTargetArgs(args, parsedTarget)
    args.push('--filename', input.filename)
    appendPreserveModifiedArg(args, input.preserveModified)
    await runSuccess(args, input)
  }

  export async function trash(target: NoteTarget, options: MoveOptions = {}): Promise<void> {
    await moveNote('trash', target, options)
  }

  export async function archive(target: NoteTarget, options: MoveOptions = {}): Promise<void> {
    await moveNote('archive', target, options)
  }

  export async function restore(target: NoteTarget, options: MoveOptions = {}): Promise<void> {
    await moveNote('restore', target, options)
  }

  export async function open(target: NoteTarget, options: OpenOptions = {}): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(OpenOptionsSchema, options)
    const args = ['open']
    appendTargetArgs(args, parsedTarget)
    if (input.header) {
      args.push('--header', input.header)
    }
    appendBooleanArg(args, '--edit', input.edit)
    appendBooleanArg(args, '--new-window', input.newWindow)
    await runSuccess(args, input)
  }

  async function mutateTags(subcommand: 'add' | 'remove', target: NoteTarget, options: TagsOptions): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(TagsOptionsSchema, options)
    const args = ['tags', subcommand]
    appendTargetArgs(args, parsedTarget)
    args.push(...input.tags)
    await runSuccess(args, input)
  }

  async function mutatePins(subcommand: 'add' | 'remove', target: NoteTarget, options: PinsOptions): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(PinsOptionsSchema, options)
    const args = ['pin', subcommand]
    appendTargetArgs(args, parsedTarget)
    args.push(...input.targets)
    await runSuccess(args, input)
  }

  async function moveNote(
    command: 'archive' | 'restore' | 'trash',
    target: NoteTarget,
    options: MoveOptions
  ): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(MoveOptionsSchema, options)
    const args = [command]
    appendTargetArgs(args, parsedTarget)
    await runSuccess(args, input)
  }

  function appendListArgs(args: string[], options: ListOptions): void {
    appendPagingArgs(args, options)
    if (options.location) {
      args.push('--location', options.location)
    }
    if (options.tag) {
      args.push('--tag', options.tag)
    }
    if (options.sort) {
      args.push('--sort', options.sort)
    }
  }

  function appendSearchArgs(args: string[], options: SearchOptions): void {
    appendPagingArgs(args, options)
    if (options.location) {
      args.push('--location', options.location)
    }
    if (options.sort) {
      args.push('--sort', options.sort)
    }
  }

  function appendPagingArgs(args: string[], options: { limit?: number; offset?: number }): void {
    if (options.limit !== undefined) {
      args.push('--limit', String(options.limit))
    }
    if (options.offset !== undefined) {
      args.push('--offset', String(options.offset))
    }
  }

  function appendTargetArgs(args: string[], target: NoteTarget): void {
    if ('id' in target) {
      args.push(target.id)
      return
    }
    args.push('--title', target.title)
  }

  function appendPreserveModifiedArg(args: string[], preserveModified?: boolean): void {
    appendBooleanArg(args, '--no-update-modified', preserveModified)
  }

  function appendBooleanArg(args: string[], flag: string, enabled?: boolean): void {
    if (enabled) {
      args.push(flag)
    }
  }

  async function runSuccess(args: string[], options: RuntimeOptions, stdin?: AttachmentData): Promise<void> {
    await runText(args, options, stdin)
  }

  async function runJson<TSchema extends v.GenericSchema>(
    args: string[],
    schema: TSchema,
    options: RuntimeOptions,
    stdin?: AttachmentData
  ): Promise<v.InferOutput<TSchema>> {
    const stdout = await runText(args, options, stdin)
    return v.parse(schema, JSON.parse(stdout))
  }

  async function runText(args: string[], options: RuntimeOptions, stdin?: AttachmentData): Promise<string> {
    const command = options.command ?? (await resolveDefaultCommand(options))
    const shell = stdin === undefined ? $`${command} ${args}` : $`${command} ${args} < ${new Response(stdin)}`
    let configuredShell = shell.quiet()
    if (options.cwd) {
      configuredShell = configuredShell.cwd(options.cwd)
    }
    if (options.env) {
      configuredShell = configuredShell.env(options.env)
    }
    return configuredShell.text()
  }

  async function resolveDefaultCommand(options: RuntimeOptions): Promise<string> {
    for (const command of DEFAULT_COMMANDS) {
      try {
        let shell = $`which ${command}`.quiet()
        if (options.cwd) {
          shell = shell.cwd(options.cwd)
        }
        if (options.env) {
          shell = shell.env(options.env)
        }
        return (await shell.text()).trim() || command
      } catch {}
    }

    return DEFAULT_COMMANDS[0]
  }
}
