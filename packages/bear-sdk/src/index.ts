import { $ } from 'bun'

import * as v from 'valibot'

export namespace Bear {
  export const NoteLocationSchema = v.picklist(['notes', 'trash', 'archive', 'all'])
  export type NoteLocation = v.InferOutput<typeof NoteLocationSchema>

  export const AppendPositionSchema = v.picklist(['beginning', 'end'])
  export type AppendPosition = v.InferOutput<typeof AppendPositionSchema>

  export const RuntimeOptionsSchema = v.strictObject({
    command: v.optional(v.pipe(v.string(), v.minLength(1))),
    cwd: v.optional(v.pipe(v.string(), v.minLength(1))),
    env: v.optional(v.record(v.string(), v.optional(v.string())))
  })
  export type RuntimeOptions = v.InferOutput<typeof RuntimeOptionsSchema>

  export const NoteTargetSchema = v.union([
    v.strictObject({ id: v.pipe(v.string(), v.minLength(1)) }),
    v.strictObject({ title: v.pipe(v.string(), v.minLength(1)) })
  ])
  export type NoteTarget = v.InferOutput<typeof NoteTargetSchema>

  const PositiveIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(1))
  const NonNegativeIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(0))
  const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))
  const StringArraySchema = v.array(v.string())
  const LockedSchema = v.pipe(
    v.picklist(['no', 'yes']),
    v.transform(input => input === 'yes')
  )

  export const ListOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    limit: v.optional(PositiveIntegerSchema),
    location: v.optional(NoteLocationSchema),
    offset: v.optional(NonNegativeIntegerSchema),
    sort: v.optional(NonEmptyStringSchema),
    tag: v.optional(NonEmptyStringSchema)
  })
  export type ListOptions = v.InferOutput<typeof ListOptionsSchema>

  export const SearchOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    limit: v.optional(PositiveIntegerSchema),
    location: v.optional(NoteLocationSchema),
    offset: v.optional(NonNegativeIntegerSchema),
    sort: v.optional(NonEmptyStringSchema)
  })
  export type SearchOptions = v.InferOutput<typeof SearchOptionsSchema>

  export const ShowOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    includeContent: v.optional(v.boolean())
  })
  export type ShowOptions = v.InferOutput<typeof ShowOptionsSchema>

  export const CatOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    limit: v.optional(PositiveIntegerSchema),
    offset: v.optional(NonNegativeIntegerSchema)
  })
  export type CatOptions = v.InferOutput<typeof CatOptionsSchema>

  export const SearchInOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    context: v.optional(PositiveIntegerSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    limit: v.optional(PositiveIntegerSchema),
    string: NonEmptyStringSchema
  })
  export type SearchInOptions = v.InferOutput<typeof SearchInOptionsSchema>

  export const CreateOptionsSchema = v.pipe(
    v.strictObject({
      command: v.optional(NonEmptyStringSchema),
      content: v.optional(v.string()),
      cwd: v.optional(NonEmptyStringSchema),
      env: v.optional(v.record(v.string(), v.optional(v.string()))),
      ifNotExists: v.optional(v.boolean()),
      tags: v.optional(v.array(NonEmptyStringSchema)),
      title: v.optional(NonEmptyStringSchema)
    }),
    v.check(input => Boolean(input.title ?? input.content), 'Create requires a title or content'),
    v.check(input => !input.ifNotExists || Boolean(input.title), 'ifNotExists requires a title')
  )
  export type CreateOptions = v.InferOutput<typeof CreateOptionsSchema>

  export const AppendOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    content: v.string(),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    position: v.optional(AppendPositionSchema),
    preserveModified: v.optional(v.boolean())
  })
  export type AppendOptions = v.InferOutput<typeof AppendOptionsSchema>

  export const EditOptionsSchema = v.pipe(
    v.strictObject({
      all: v.optional(v.boolean()),
      at: NonEmptyStringSchema,
      command: v.optional(NonEmptyStringSchema),
      cwd: v.optional(NonEmptyStringSchema),
      env: v.optional(v.record(v.string(), v.optional(v.string()))),
      ignoreCase: v.optional(v.boolean()),
      insert: v.optional(v.string()),
      preserveModified: v.optional(v.boolean()),
      replace: v.optional(v.string()),
      word: v.optional(v.boolean())
    }),
    v.check(input => {
      const hasInsert = input.insert !== undefined
      const hasReplace = input.replace !== undefined
      return hasInsert !== hasReplace
    }, 'Edit requires exactly one of insert or replace')
  )
  export type EditOptions = v.InferOutput<typeof EditOptionsSchema>

  export const WriteOptionsSchema = v.strictObject({
    base: v.optional(NonEmptyStringSchema),
    command: v.optional(NonEmptyStringSchema),
    content: v.string(),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    preserveModified: v.optional(v.boolean())
  })
  export type WriteOptions = v.InferOutput<typeof WriteOptionsSchema>

  export const TagsOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    tags: v.pipe(v.array(NonEmptyStringSchema), v.minLength(1))
  })
  export type TagsOptions = v.InferOutput<typeof TagsOptionsSchema>

  export const PinsOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    targets: v.pipe(v.array(NonEmptyStringSchema), v.minLength(1))
  })
  export type PinsOptions = v.InferOutput<typeof PinsOptionsSchema>

  export const RenameTagGloballyOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    force: v.optional(v.boolean()),
    from: NonEmptyStringSchema,
    to: NonEmptyStringSchema
  })
  export type RenameTagGloballyOptions = v.InferOutput<typeof RenameTagGloballyOptionsSchema>

  export const DeleteTagGloballyOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    name: NonEmptyStringSchema
  })
  export type DeleteTagGloballyOptions = v.InferOutput<typeof DeleteTagGloballyOptionsSchema>

  export const AttachmentListOptionsSchema = RuntimeOptionsSchema
  export type AttachmentListOptions = RuntimeOptions

  export const AttachmentDataSchema = v.union([v.instance(Uint8Array), v.instance(ArrayBuffer), v.string()])
  export type AttachmentData = v.InferOutput<typeof AttachmentDataSchema>

  export const AttachmentAddOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    data: AttachmentDataSchema,
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    filename: NonEmptyStringSchema,
    preserveModified: v.optional(v.boolean())
  })
  export type AttachmentAddOptions = v.InferOutput<typeof AttachmentAddOptionsSchema>

  export const AttachmentSaveOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    filename: NonEmptyStringSchema
  })
  export type AttachmentSaveOptions = v.InferOutput<typeof AttachmentSaveOptionsSchema>

  export const AttachmentDeleteOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    filename: NonEmptyStringSchema,
    preserveModified: v.optional(v.boolean())
  })
  export type AttachmentDeleteOptions = v.InferOutput<typeof AttachmentDeleteOptionsSchema>

  export const MoveOptionsSchema = RuntimeOptionsSchema
  export type MoveOptions = RuntimeOptions

  export const OpenOptionsSchema = v.strictObject({
    command: v.optional(NonEmptyStringSchema),
    cwd: v.optional(NonEmptyStringSchema),
    edit: v.optional(v.boolean()),
    env: v.optional(v.record(v.string(), v.optional(v.string()))),
    header: v.optional(NonEmptyStringSchema),
    newWindow: v.optional(v.boolean())
  })
  export type OpenOptions = v.InferOutput<typeof OpenOptionsSchema>

  export const NoteSummarySchema = v.strictObject({
    id: v.string(),
    modified: v.string(),
    tags: StringArraySchema,
    title: v.string()
  })
  export type NoteSummary = v.InferOutput<typeof NoteSummarySchema>

  export const SearchResultSchema = v.strictObject({
    id: v.string(),
    matches: v.number(),
    modified: v.string(),
    tags: StringArraySchema,
    title: v.string()
  })
  export type SearchResult = v.InferOutput<typeof SearchResultSchema>

  export const NoteSchema = v.strictObject({
    content: v.optional(v.string()),
    created: v.string(),
    hash: v.string(),
    id: v.string(),
    location: v.picklist(['notes', 'trash', 'archive']),
    locked: LockedSchema,
    modified: v.string(),
    tags: StringArraySchema,
    title: v.string()
  })
  export type Note = v.InferOutput<typeof NoteSchema>

  export const CreatedNoteSchema = v.strictObject({
    hash: v.string(),
    id: v.string(),
    tags: StringArraySchema,
    title: v.string()
  })
  export type CreatedNote = v.InferOutput<typeof CreatedNoteSchema>

  export const CatResultSchema = v.strictObject({
    content: v.string()
  })

  export const CountResultSchema = v.strictObject({
    count: NonNegativeIntegerSchema
  })

  export const SearchInMatchSchema = v.strictObject({
    offset: NonNegativeIntegerSchema,
    snippet: v.string()
  })
  export type SearchInMatch = v.InferOutput<typeof SearchInMatchSchema>

  export const TagEntrySchema = v.strictObject({
    tag: v.string()
  })
  export type TagEntry = v.InferOutput<typeof TagEntrySchema>

  export const PinEntrySchema = v.strictObject({
    pin: v.string()
  })
  export type PinEntry = v.InferOutput<typeof PinEntrySchema>

  export const AttachmentSchema = v.strictObject({
    filename: v.string(),
    size: NonNegativeIntegerSchema
  })
  export type Attachment = v.InferOutput<typeof AttachmentSchema>

  export const SavedAttachmentSchema = v.strictObject({
    base64: v.string(),
    filename: v.string(),
    size: NonNegativeIntegerSchema
  })
  export type SavedAttachment = v.InferOutput<typeof SavedAttachmentSchema>

  export const SuccessSchema = v.strictObject({
    ok: v.literal(true)
  })

  export async function list(options: ListOptions = {}): Promise<NoteSummary[]> {
    const input = v.parse(ListOptionsSchema, options)
    const args = ['list', '--format', 'json', '--fields', 'id,title,tags,modified']
    appendListArgs(args, input)
    return runJson(args, v.array(NoteSummarySchema), input)
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
    const args = ['search', '--query', parsedQuery, '--format', 'json', '--fields', 'id,title,tags,matches,modified']
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
    const fields = input.includeContent
      ? 'id,title,tags,hash,created,modified,location,locked,content'
      : 'id,title,tags,hash,created,modified,location,locked'
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
    args.push('--format', 'json', '--fields', 'id,title,tags,hash')
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
    args.push('--at', input.at)
    if (input.replace !== undefined) {
      args.push('--replace', input.replace)
    }
    if (input.insert !== undefined) {
      args.push('--insert', input.insert)
    }
    appendBooleanArg(args, '--all', input.all)
    appendBooleanArg(args, '--ignore-case', input.ignoreCase)
    appendBooleanArg(args, '--word', input.word)
    appendPreserveModifiedArg(args, input.preserveModified)
    await runSuccess(args, input)
  }

  export async function write(target: NoteTarget, options: WriteOptions): Promise<void> {
    const parsedTarget = v.parse(NoteTargetSchema, target)
    const input = v.parse(WriteOptionsSchema, options)
    const args = ['write']
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
    await runJson(argsWithJson(args), SuccessSchema, options, stdin)
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
    const command = options.command ?? 'bear'
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

  function argsWithJson(args: string[]): string[] {
    return [...args, '--format', 'json']
  }
}
