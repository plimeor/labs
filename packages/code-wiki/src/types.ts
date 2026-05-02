import * as v from 'valibot'

export const TextSchema = v.pipe(v.string(), v.trim(), v.minLength(1))
export const OptionalTextSchema = v.optional(TextSchema)
export const OptionalTextArraySchema = v.optional(v.array(TextSchema))

export const WorkspaceModeSchema = v.picklist(['shared', 'embedded'])
export type WorkspaceMode = v.InferOutput<typeof WorkspaceModeSchema>

export const CodeWikiConfigSchema = v.pipe(
  v.strictObject({
    mode: WorkspaceModeSchema,
    schemaVersion: v.literal(1)
  }),
  v.transform(input => ({
    mode: input.mode,
    schemaVersion: 1 as const
  }))
)
export type CodeWikiConfig = v.InferOutput<typeof CodeWikiConfigSchema>

export const ProjectIdSchema = v.pipe(
  TextSchema,
  v.transform(input =>
    input
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  ),
  v.check(input => /^[a-z0-9][a-z0-9._-]*$/.test(input), 'Invalid project id')
)

export function normalizeProjectId(input: unknown): string {
  return v.parse(ProjectIdSchema, input)
}

export function codeWikiPath(...segments: string[]): string {
  return ['.code-wiki', ...segments].join('/')
}

export const CodeWikiPathSchema = v.pipe(
  TextSchema,
  v.check(input => isPortableCodeWikiPath(input), 'Path must be a portable relative path under .code-wiki/')
)

const RawProjectEntryEntries = {
  displayName: OptionalTextSchema,
  exclude: OptionalTextArraySchema,
  id: ProjectIdSchema,
  include: OptionalTextArraySchema,
  managedRepoPath: v.optional(CodeWikiPathSchema),
  ref: OptionalTextSchema,
  repoUrl: TextSchema,
  wikiPath: v.optional(CodeWikiPathSchema)
}

const RawProjectEntrySchema = v.strictObject(RawProjectEntryEntries)

export const ProjectEntrySchema = v.pipe(
  RawProjectEntrySchema,
  v.transform(input => {
    const managedRepoPath: string | undefined = input.managedRepoPath ?? codeWikiPath('repos', input.id)
    return {
      displayName: input.displayName ?? input.id,
      id: input.id,
      ...(input.exclude === undefined ? {} : { exclude: input.exclude }),
      ...(input.include === undefined ? {} : { include: input.include }),
      ...(managedRepoPath === undefined ? {} : { managedRepoPath }),
      ref: input.ref ?? 'HEAD',
      repoUrl: input.repoUrl,
      wikiPath: input.wikiPath ?? codeWikiPath('projects', input.id)
    }
  })
)
export type ProjectEntry = v.InferOutput<typeof ProjectEntrySchema>

export const ProjectsDocumentSchema = v.pipe(
  v.strictObject({
    projects: v.array(ProjectEntrySchema),
    schemaVersion: v.literal(1)
  }),
  v.transform(input => {
    const seen = new Set<string>()
    const projects = input.projects.sort((a, b) => a.id.localeCompare(b.id))

    for (const project of projects) {
      if (seen.has(project.id)) {
        throw new Error(`Duplicate project: ${project.id}`)
      }
      seen.add(project.id)
    }

    return {
      projects,
      schemaVersion: 1 as const
    }
  })
)
export type ProjectsDocument = v.InferOutput<typeof ProjectsDocumentSchema>

export const EmbeddedProjectSchema = v.pipe(
  v.strictObject({
    ...RawProjectEntryEntries,
    repositoryRoot: TextSchema
  }),
  v.transform(input => {
    const project = v.parse(ProjectEntrySchema, input)
    return {
      ...project,
      ...(input.managedRepoPath === undefined
        ? { managedRepoPath: undefined }
        : { managedRepoPath: input.managedRepoPath }),
      repositoryRoot: input.repositoryRoot,
      wikiPath: input.wikiPath ?? codeWikiPath('wiki')
    }
  })
)
export type EmbeddedProject = v.InferOutput<typeof EmbeddedProjectSchema>

export const ProjectMetadataSchema = v.pipe(
  v.strictObject({
    branch: TextSchema,
    exclude: OptionalTextArraySchema,
    include: OptionalTextArraySchema,
    lastScannedAt: TextSchema,
    lastScannedCommit: TextSchema,
    projectId: TextSchema,
    ref: OptionalTextSchema,
    repoUrl: OptionalTextSchema,
    schemaVersion: v.literal(1)
  }),
  v.transform(input => ({
    branch: input.branch,
    ...(input.exclude === undefined ? {} : { exclude: input.exclude }),
    ...(input.include === undefined ? {} : { include: input.include }),
    lastScannedAt: input.lastScannedAt,
    lastScannedCommit: input.lastScannedCommit,
    projectId: input.projectId,
    ref: input.ref ?? input.branch,
    ...(input.repoUrl === undefined ? {} : { repoUrl: input.repoUrl }),
    schemaVersion: 1 as const
  }))
)
export type ProjectMetadata = v.InferOutput<typeof ProjectMetadataSchema>

export const WikiPageKindSchema = v.picklist(['overview', 'index', 'module', 'contract'])
export type WikiPageKind = v.InferOutput<typeof WikiPageKindSchema>

export const WikiPageAuthoritySchema = v.literal('generated')
export type WikiPageAuthority = v.InferOutput<typeof WikiPageAuthoritySchema>

const FallbackTextArraySchema = v.pipe(
  v.unknown(),
  v.transform(input => (Array.isArray(input) ? input : [])),
  v.array(TextSchema)
)

export const WikiIndexPageSchema = v.strictObject({
  authority: WikiPageAuthoritySchema,
  contentHash: TextSchema,
  dependsOn: v.optional(v.array(TextSchema)),
  id: TextSchema,
  kind: WikiPageKindSchema,
  lastScannedCommit: TextSchema,
  path: TextSchema,
  sourceRefs: FallbackTextArraySchema,
  summary: TextSchema,
  symbols: FallbackTextArraySchema,
  title: TextSchema
})
export type WikiIndexPage = v.InferOutput<typeof WikiIndexPageSchema>

export const WikiIndexDocumentSchema = v.pipe(
  v.strictObject({
    commit: TextSchema,
    pages: v.array(WikiIndexPageSchema),
    projectId: TextSchema,
    schemaVersion: v.literal(1)
  }),
  v.transform(input => ({
    commit: input.commit,
    pages: input.pages,
    projectId: input.projectId,
    schemaVersion: 1 as const
  }))
)
export type WikiIndexDocument = v.InferOutput<typeof WikiIndexDocumentSchema>

function isPortableCodeWikiPath(input: string): boolean {
  if (!input.startsWith('.code-wiki/')) {
    return false
  }

  if (input.includes('\\') || input.includes('//') || /^[A-Za-z]:/.test(input)) {
    return false
  }

  return input.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..')
}
