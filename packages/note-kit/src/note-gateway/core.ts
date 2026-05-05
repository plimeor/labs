import * as v from 'valibot'

const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1))
const StringArraySchema = v.array(NonEmptyStringSchema)
const PositiveIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(1))
const NoteLocationSchema = v.picklist(['notes', 'trash', 'archive', 'all'])
const NoteSummaryLocationSchema = v.picklist(['notes', 'trash', 'archive'])
const AppendPositionSchema = v.picklist(['beginning', 'end'])

export const NoteIdSchema = NonEmptyStringSchema
export const NoteHashSchema = NonEmptyStringSchema

export const NoteScopeSchema = v.strictObject({
  excludedTags: v.optional(
    v.pipe(StringArraySchema, v.description("Tags that make a note outside this ChangeSet's allowed write scope.")),
    []
  ),
  noteIds: v.optional(
    v.pipe(StringArraySchema, v.description('Optional fixed set of note ids this ChangeSet may read or mutate.'))
  ),
  queryPrefix: v.optional(v.pipe(v.string(), v.description('Optional search prefix applied when browsing notes.'))),
  requiredTags: v.optional(
    v.pipe(
      StringArraySchema,
      v.description('Tags every target note must have. Created notes will receive these tags.')
    ),
    []
  )
})

export const NoteSearchQuerySchema = v.strictObject({
  excludedTags: v.optional(StringArraySchema, []),
  limit: v.optional(PositiveIntegerSchema, 20),
  location: v.optional(NoteLocationSchema, 'notes'),
  noteIds: v.optional(StringArraySchema),
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  requiredTags: v.optional(StringArraySchema, []),
  sort: v.optional(v.string(), 'pinned,modified'),
  text: v.optional(v.string())
})

export const NoteSummarySchema = v.strictObject({
  createdAt: v.string(),
  hash: NoteHashSchema,
  id: NoteIdSchema,
  location: NoteSummaryLocationSchema,
  modifiedAt: v.string(),
  tags: StringArraySchema,
  title: v.string()
})

export const NoteSchema = v.strictObject({
  content: v.string(),
  createdAt: v.string(),
  hash: NoteHashSchema,
  id: NoteIdSchema,
  location: NoteSummaryLocationSchema,
  modifiedAt: v.string(),
  tags: StringArraySchema,
  title: v.string()
})

export const NoteRefSchema = NoteSummarySchema

export const CreateNoteInputSchema = v.strictObject({
  content: v.optional(v.pipe(v.string(), v.description('Initial Markdown content for the new note.')), ''),
  tags: v.optional(v.pipe(StringArraySchema, v.description('Tags for the new note.')), []),
  title: v.pipe(NonEmptyStringSchema, v.description('Title for the new note.'))
})

const ExistingNoteTargetSchema = v.strictObject({
  noteId: v.pipe(NoteIdSchema, v.description('Existing note id to mutate.'))
})

export const AppendNoteInputSchema = v.strictObject({
  content: NonEmptyStringSchema,
  noteId: NoteIdSchema,
  position: v.optional(AppendPositionSchema, 'end')
})

export const ReplaceNoteContentInputSchema = v.strictObject({
  content: v.string(),
  noteId: NoteIdSchema
})

export const UpdateNoteTagsInputSchema = v.strictObject({
  add: v.optional(StringArraySchema, []),
  noteId: NoteIdSchema,
  remove: v.optional(StringArraySchema, [])
})

export const AddWikilinkInputSchema = v.strictObject({
  alias: v.optional(v.string()),
  all: v.optional(v.boolean(), false),
  mention: NonEmptyStringSchema,
  noteId: NoteIdSchema,
  wholeWord: v.optional(v.boolean(), true),
  wikiTitle: NonEmptyStringSchema
})

export const NoteMutationResultSchema = v.strictObject({
  currentHash: NoteHashSchema,
  followUpRead: v.boolean(),
  noteId: NoteIdSchema,
  previousHash: NoteHashSchema
})

const EvidenceSchema = v.pipe(
  v.strictObject({
    noteId: v.optional(v.pipe(NoteIdSchema, v.description('Source note id that justifies this operation.'))),
    quote: v.optional(v.pipe(v.string(), v.description('Short source quote supporting this operation.'))),
    source: v.optional(v.pipe(v.string(), v.description('External source, file path, or brief source label.')))
  }),
  v.description('Evidence for why the operation is allowed. Provide at least one of noteId, quote, or source.'),
  v.check(input => Boolean(input.noteId ?? input.quote ?? input.source), 'Evidence requires noteId, quote, or source.')
)
const NonEmptyEvidenceArraySchema = v.pipe(v.array(EvidenceSchema), v.minLength(1))

const OperationBase = {
  evidence: v.optional(
    v.pipe(v.array(EvidenceSchema), v.description('Evidence supporting this operation. Required for createWikiStub.')),
    []
  ),
  id: v.pipe(NonEmptyStringSchema, v.description('Stable operation id, unique inside this ChangeSet, such as op-1.')),
  rationale: v.optional(
    v.pipe(v.string(), v.description('Brief reason for this operation. Keep it concrete and source-grounded.')),
    ''
  ),
  requiresConfirmation: v.pipe(
    v.boolean(),
    v.description(
      'Whether a human should review this operation before trusting the result. Use true for judgment-heavy or high-impact writes.'
    )
  ),
  risk: v.pipe(
    v.picklist(['bookkeeping', 'judgment', 'summary', 'supersession', 'profile', 'globalConfig']),
    v.description(
      'Risk class. Use bookkeeping for mechanical fixes, judgment for subjective edits, summary for synthesis, supersession for replacing an older wiki claim, profile for profile-like personal understanding, and globalConfig for behavior-rule changes.'
    )
  )
}

const AppendSectionOperationSchema = v.strictObject({
  ...OperationBase,
  input: v.strictObject({
    content: v.pipe(NonEmptyStringSchema, v.description('Markdown content to append under the named heading.')),
    createIfMissing: v.optional(
      v.pipe(v.boolean(), v.description('Create the heading when it does not already exist.')),
      false
    ),
    heading: v.pipe(NonEmptyStringSchema, v.description('Markdown heading text without leading # characters.')),
    separator: v.optional(v.pipe(v.string(), v.description('Separator inserted before appended content.')), '\n\n')
  }),
  kind: v.literal('appendSection'),
  target: ExistingNoteTargetSchema
})

const ReplaceSectionOperationSchema = v.strictObject({
  ...OperationBase,
  input: v.strictObject({
    content: v.pipe(v.string(), v.description('Full replacement Markdown for that section.')),
    createIfMissing: v.optional(
      v.pipe(v.boolean(), v.description('Create the heading when it does not already exist.')),
      false
    ),
    heading: v.pipe(NonEmptyStringSchema, v.description('Markdown heading text without leading # characters.'))
  }),
  kind: v.literal('replaceSection'),
  target: ExistingNoteTargetSchema
})

const UpdateTagsOperationSchema = v.strictObject({
  ...OperationBase,
  input: v.strictObject({
    add: v.optional(v.pipe(StringArraySchema, v.description('Tags to add to the target note.')), []),
    remove: v.optional(
      v.pipe(
        StringArraySchema,
        v.description('Tags to remove from the target note. Cannot remove required scope tags.')
      ),
      []
    )
  }),
  kind: v.literal('updateTags'),
  target: ExistingNoteTargetSchema
})

const CreateNoteOperationSchema = v.strictObject({
  ...OperationBase,
  input: CreateNoteInputSchema,
  kind: v.literal('createNote')
})

const CreateWikiStubOperationSchema = v.strictObject({
  ...OperationBase,
  evidence: v.pipe(NonEmptyEvidenceArraySchema, v.description('Required evidence for creating a wiki stub.')),
  input: v.strictObject({
    body: v.optional(
      v.pipe(v.string(), v.description('Optional initial Markdown body. Leave empty for a tag-only wiki stub.')),
      ''
    ),
    tags: v.optional(v.pipe(StringArraySchema, v.description('Additional tags besides the required wiki tag.')), []),
    title: v.pipe(NonEmptyStringSchema, v.description('Wiki note title to create.'))
  }),
  kind: v.literal('createWikiStub')
})

const AddWikilinkOperationSchema = v.strictObject({
  ...OperationBase,
  input: v.strictObject({
    alias: v.optional(v.pipe(v.string(), v.description('Optional display alias for [[wikiTitle|alias]].'))),
    all: v.optional(v.pipe(v.boolean(), v.description('Replace all matching mentions, not just the first.')), false),
    mention: v.pipe(NonEmptyStringSchema, v.description('Plain text mention to replace with a wikilink.')),
    wholeWord: v.optional(v.pipe(v.boolean(), v.description('Match mention as a whole word.')), true),
    wikiTitle: v.pipe(NonEmptyStringSchema, v.description('Target wiki title inside [[...]].'))
  }),
  kind: v.literal('addWikilink'),
  target: ExistingNoteTargetSchema
})

export const NoteChangeOperationSchema = v.variant('kind', [
  AppendSectionOperationSchema,
  ReplaceSectionOperationSchema,
  UpdateTagsOperationSchema,
  CreateNoteOperationSchema,
  CreateWikiStubOperationSchema,
  AddWikilinkOperationSchema
])

export const NoteChangeSetSchema = v.pipe(
  v.strictObject({
    operations: v.pipe(
      v.array(NoteChangeOperationSchema),
      v.description('Ordered note mutations to apply. Return an empty array when no external note write is needed.')
    ),
    scope: v.optional(
      v.pipe(
        NoteScopeSchema,
        v.description('Optional write scope. It is intersected with the gateway scope before applying.')
      ),
      {}
    ),
    task: v.pipe(
      NonEmptyStringSchema,
      v.description('Task name producing this ChangeSet, for example task-notes-lint.')
    ),
    version: v.pipe(v.literal(1), v.description('ChangeSet schema version. Always 1.'))
  }),
  v.description(
    'Structured note write request returned by an agent. The task may edit workspace files directly, but every external note-system write must be represented here and applied through NoteGateway.applyChangeSet.'
  )
)

export const NoteOperationReportSchema = v.strictObject({
  currentHash: v.optional(NoteHashSchema),
  id: NonEmptyStringSchema,
  kind: NonEmptyStringSchema,
  message: v.optional(v.string()),
  noteId: v.optional(NoteIdSchema),
  previousHash: v.optional(NoteHashSchema),
  requiresConfirmation: v.boolean(),
  risk: OperationBase.risk,
  status: v.picklist(['executed', 'failed'])
})

export const NoteChangeReportSchema = v.strictObject({
  appliedAt: v.string(),
  operations: v.array(NoteOperationReportSchema),
  scope: NoteScopeSchema,
  status: v.picklist(['completed', 'partial', 'failed']),
  task: NonEmptyStringSchema,
  version: v.literal(1)
})

export type NoteId = v.InferOutput<typeof NoteIdSchema>
export type NoteHash = v.InferOutput<typeof NoteHashSchema>
export type NoteScope = v.InferOutput<typeof NoteScopeSchema>
export type NoteScopeInput = v.InferInput<typeof NoteScopeSchema>
export type NoteSearchQuery = v.InferOutput<typeof NoteSearchQuerySchema>
export type NoteSearchQueryInput = v.InferInput<typeof NoteSearchQuerySchema>
export type NoteSummary = v.InferOutput<typeof NoteSummarySchema>
export type Note = v.InferOutput<typeof NoteSchema>
export type NoteRef = v.InferOutput<typeof NoteRefSchema>
export type CreateNoteInput = v.InferInput<typeof CreateNoteInputSchema>
export type AppendNoteInput = v.InferInput<typeof AppendNoteInputSchema>
export type ReplaceNoteContentInput = v.InferInput<typeof ReplaceNoteContentInputSchema>
export type UpdateNoteTagsInput = v.InferInput<typeof UpdateNoteTagsInputSchema>
export type AddWikilinkInput = v.InferInput<typeof AddWikilinkInputSchema>
export type NoteMutationResult = v.InferOutput<typeof NoteMutationResultSchema>
export type NoteChangeOperation = v.InferOutput<typeof NoteChangeOperationSchema>
export type NoteChangeSet = v.InferOutput<typeof NoteChangeSetSchema>
export type NoteOperationReport = v.InferOutput<typeof NoteOperationReportSchema>
export type NoteChangeReport = v.InferOutput<typeof NoteChangeReportSchema>

export abstract class NoteGateway {
  public readonly scope: NoteScope

  constructor(scope: NoteScopeInput = {}) {
    this.scope = normalizeScope(v.parse(NoteScopeSchema, scope))
    assertSelfConsistentScope(this.scope)
  }

  public abstract search(query?: NoteSearchQueryInput): Promise<NoteSummary[]>
  public abstract get(noteId: NoteId): Promise<Note>
  public abstract createNote(input: CreateNoteInput): Promise<NoteRef>
  public abstract appendNote(input: AppendNoteInput): Promise<NoteMutationResult>
  public abstract replaceNoteContent(input: ReplaceNoteContentInput): Promise<NoteMutationResult>
  public abstract updateNoteTags(input: UpdateNoteTagsInput): Promise<NoteMutationResult>
  public abstract addWikilink(input: AddWikilinkInput): Promise<NoteMutationResult>

  public async applyChangeSet(input: unknown): Promise<NoteChangeReport> {
    const changeSet = v.parse(NoteChangeSetSchema, input)
    const changeSetScope = normalizeScope(changeSet.scope)
    assertCompatibleScopes(this.scope, changeSetScope)
    const scope = intersectScopes(this.scope, changeSetScope)
    const operations: NoteOperationReport[] = []

    for (const operation of changeSet.operations) {
      try {
        const result = await this.applyOperation(operation, scope)
        operations.push({
          currentHash: result.currentHash,
          id: operation.id,
          kind: operation.kind,
          noteId: result.noteId,
          previousHash: result.previousHash,
          requiresConfirmation: operation.requiresConfirmation,
          risk: operation.risk,
          status: 'executed'
        })
      } catch (error) {
        operations.push({
          id: operation.id,
          kind: operation.kind,
          message: error instanceof Error ? error.message : String(error),
          noteId: 'target' in operation ? operation.target.noteId : undefined,
          requiresConfirmation: operation.requiresConfirmation,
          risk: operation.risk,
          status: 'failed'
        })
      }
    }

    return {
      status: reportStatus(operations),
      task: changeSet.task,
      version: 1,
      scope,
      appliedAt: new Date().toISOString(),
      operations
    }
  }

  private async applyOperation(operation: NoteChangeOperation, scope: NoteScope): Promise<NoteMutationResult> {
    switch (operation.kind) {
      case 'appendSection': {
        const note = await this.getScopedTarget(operation.target, scope)
        const content = appendMarkdownSection(
          note.content,
          operation.input.heading,
          operation.input.content,
          operation.input.createIfMissing,
          operation.input.separator
        )
        return this.replaceNoteContent({
          noteId: note.id,
          content
        })
      }
      case 'replaceSection': {
        const note = await this.getScopedTarget(operation.target, scope)
        const content = replaceMarkdownSection(
          note.content,
          operation.input.heading,
          operation.input.content,
          operation.input.createIfMissing
        )
        return this.replaceNoteContent({
          noteId: note.id,
          content
        })
      }
      case 'updateTags': {
        await this.getScopedTarget(operation.target, scope)
        assertTagMutationAllowedByScope(operation.input, scope)
        return this.updateNoteTags({
          add: operation.input.add,
          noteId: operation.target.noteId,
          remove: operation.input.remove
        })
      }
      case 'createNote': {
        const tags = uniqueTags([...scope.requiredTags, ...operation.input.tags])
        assertCreateAllowedByScope(scope, tags)
        const ref = await this.createNote({
          content: operation.input.content,
          title: operation.input.title,
          tags
        })
        const note = await this.get(ref.id)
        return {
          currentHash: note.hash,
          followUpRead: true,
          noteId: ref.id,
          previousHash: ref.hash
        }
      }
      case 'createWikiStub': {
        const tags = uniqueTags(['wiki', ...scope.requiredTags, ...operation.input.tags])
        assertCreateAllowedByScope(scope, tags)
        const ref = await this.createNote({
          title: operation.input.title,
          tags,
          content: operation.input.body
        })
        const note = await this.get(ref.id)
        return {
          currentHash: note.hash,
          followUpRead: true,
          noteId: ref.id,
          previousHash: ref.hash
        }
      }
      case 'addWikilink': {
        await this.getScopedTarget(operation.target, scope)
        return this.addWikilink({
          alias: operation.input.alias,
          all: operation.input.all,
          mention: operation.input.mention,
          noteId: operation.target.noteId,
          wholeWord: operation.input.wholeWord,
          wikiTitle: operation.input.wikiTitle
        })
      }
    }
  }

  private async getScopedTarget(target: { noteId: NoteId }, scope: NoteScope): Promise<Note> {
    const note = await this.get(target.noteId)
    assertNoteInScope(note, scope)
    return note
  }
}

function normalizeScope(scope: NoteScope): NoteScope {
  return {
    excludedTags: uniqueTags(scope.excludedTags),
    noteIds: scope.noteIds ? [...new Set(scope.noteIds)] : undefined,
    queryPrefix: scope.queryPrefix,
    requiredTags: uniqueTags(scope.requiredTags)
  }
}

function assertSelfConsistentScope(scope: NoteScope): void {
  const overlap = scope.requiredTags.filter(tag => scope.excludedTags.includes(tag))
  if (overlap.length > 0) {
    throw new Error(`Scope cannot both require and exclude tags: ${overlap.join(', ')}`)
  }
}

export function mergeSearchScope(scope: NoteScope, query: NoteSearchQuery): NoteSearchQuery {
  return {
    ...query,
    excludedTags: uniqueTags([...scope.excludedTags, ...query.excludedTags]),
    noteIds:
      scope.noteIds && query.noteIds
        ? query.noteIds.filter(id => scope.noteIds?.includes(id))
        : (query.noteIds ?? scope.noteIds),
    requiredTags: uniqueTags([...scope.requiredTags, ...query.requiredTags]),
    text: [scope.queryPrefix, query.text].filter(Boolean).join(' ').trim()
  }
}

function intersectScopes(left: NoteScope, right: NoteScope): NoteScope {
  return normalizeScope({
    excludedTags: uniqueTags([...left.excludedTags, ...right.excludedTags]),
    noteIds:
      left.noteIds && right.noteIds
        ? right.noteIds.filter(id => left.noteIds?.includes(id))
        : (right.noteIds ?? left.noteIds),
    queryPrefix: [left.queryPrefix, right.queryPrefix].filter(Boolean).join(' ').trim() || undefined,
    requiredTags: uniqueTags([...left.requiredTags, ...right.requiredTags])
  })
}

function assertCompatibleScopes(left: NoteScope, right: NoteScope): void {
  for (const tag of left.requiredTags) {
    if (right.excludedTags.includes(tag)) {
      throw new Error(`ChangeSet excludes required gateway tag: ${tag}`)
    }
  }
  for (const tag of right.requiredTags) {
    if (left.excludedTags.includes(tag)) {
      throw new Error(`ChangeSet requires excluded gateway tag: ${tag}`)
    }
  }
  if (left.noteIds && right.noteIds) {
    const outside = right.noteIds.filter(id => !left.noteIds?.includes(id))
    if (outside.length > 0) {
      throw new Error(`ChangeSet note ids exceed gateway scope: ${outside.join(', ')}`)
    }
  }
}

export function assertCreateAllowedByScope(scope: NoteScope, tags: string[]): void {
  if (scope.noteIds && scope.noteIds.length > 0) {
    throw new Error('Cannot create a note inside a fixed note-id scope.')
  }
  const normalizedTags = uniqueTags(tags)
  for (const tag of normalizedTags) {
    if (scope.excludedTags.includes(tag)) {
      throw new Error(`Tag is excluded by scope: ${tag}`)
    }
  }
}

function assertTagMutationAllowedByScope(input: { add: string[]; remove: string[] }, scope: NoteScope): void {
  for (const tag of input.add) {
    if (scope.excludedTags.includes(normalizeTag(tag))) {
      throw new Error(`Tag is excluded by ChangeSet scope: ${tag}`)
    }
  }
  for (const tag of input.remove) {
    if (scope.requiredTags.includes(normalizeTag(tag))) {
      throw new Error(`Cannot remove required ChangeSet scope tag: ${tag}`)
    }
  }
}

export function assertNoteInScope(note: Pick<NoteSummary, 'id' | 'tags'>, scope: NoteScope): void {
  if (scope.noteIds && !scope.noteIds.includes(note.id)) {
    throw new Error(`Note is outside note-id scope: ${note.id}`)
  }
  for (const tag of scope.requiredTags) {
    if (!note.tags.includes(tag)) {
      throw new Error(`Note is missing required scope tag: ${tag}`)
    }
  }
  for (const tag of scope.excludedTags) {
    if (note.tags.includes(tag)) {
      throw new Error(`Note has excluded scope tag: ${tag}`)
    }
  }
}

function reportStatus(operations: NoteOperationReport[]): NoteChangeReport['status'] {
  const failedCount = operations.filter(operation => operation.status === 'failed').length
  if (failedCount === 0) return 'completed'
  if (failedCount === operations.length) return 'failed'
  return 'partial'
}

export function uniqueTags(tags: readonly string[] = []): string[] {
  return [...new Set(tags.map(normalizeTag).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#+/, '').replace(/#+$/, '')
}

function appendMarkdownSection(
  content: string,
  heading: string,
  addition: string,
  createIfMissing: boolean,
  separator: string
): string {
  const range = findMarkdownSection(content, heading)
  if (!range) {
    if (!createIfMissing) {
      throw new Error(`Markdown section not found: ${heading}`)
    }
    return `${content.trimEnd()}\n\n${normalizeHeading(heading)}\n\n${addition}\n`
  }
  const before = content.slice(0, range.bodyEnd).trimEnd()
  const after = content.slice(range.bodyEnd)
  return `${before}${separator}${addition}${after}`
}

function replaceMarkdownSection(
  content: string,
  heading: string,
  replacement: string,
  createIfMissing: boolean
): string {
  const range = findMarkdownSection(content, heading)
  if (!range) {
    if (!createIfMissing) {
      throw new Error(`Markdown section not found: ${heading}`)
    }
    return `${content.trimEnd()}\n\n${normalizeHeading(heading)}\n\n${replacement}\n`
  }
  return `${content.slice(0, range.bodyStart)}${replacement.trim()}\n${content.slice(range.bodyEnd)}`
}

function findMarkdownSection(content: string, heading: string): { bodyStart: number; bodyEnd: number } | null {
  const target = heading.replace(/^#+\s*/, '').trim()
  const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm
  let match: RegExpExecArray | null

  while ((match = headingPattern.exec(content))) {
    if (match[2]?.trim() !== target) continue
    const level = match[1]?.length ?? 1
    const lineEnd = match.index + match[0].length
    const bodyStart = content[lineEnd] === '\n' ? lineEnd + 1 : lineEnd
    const nextHeadingPattern = /^(#{1,6})\s+.+$/gm
    nextHeadingPattern.lastIndex = bodyStart
    let next: RegExpExecArray | null
    let bodyEnd = content.length

    while ((next = nextHeadingPattern.exec(content))) {
      if ((next[1]?.length ?? 1) <= level) {
        bodyEnd = next.index
        break
      }
    }

    return { bodyStart, bodyEnd }
  }

  return null
}

function normalizeHeading(heading: string): string {
  return heading.trim().startsWith('#') ? heading.trim() : `## ${heading.trim()}`
}
