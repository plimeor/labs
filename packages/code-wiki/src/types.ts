import { join } from 'node:path'

import * as v from 'valibot'

export const TextSchema = v.pipe(v.string(), v.trim(), v.minLength(1))
export const OptionalTextSchema = v.optional(TextSchema)
export const OptionalTextArraySchema = v.optional(v.array(TextSchema))

export const WorkspaceModeSchema = v.picklist(['shared', 'embedded'])
export type WorkspaceMode = v.InferOutput<typeof WorkspaceModeSchema>

export const RuntimeIdSchema = v.picklist(['codex'])
export type RuntimeId = v.InferOutput<typeof RuntimeIdSchema>

export const CodeWikiConfigSchema = v.looseObject({
  mode: WorkspaceModeSchema,
  runtime: v.optional(RuntimeIdSchema),
  schemaVersion: v.literal(1)
})
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

const RawProjectEntryEntries = {
  checkoutPath: v.optional(v.unknown()),
  defaultBranch: OptionalTextSchema,
  displayName: OptionalTextSchema,
  exclude: OptionalTextArraySchema,
  id: ProjectIdSchema,
  include: OptionalTextArraySchema,
  localPath: v.optional(v.unknown()),
  managedRepoPath: OptionalTextSchema,
  path: v.optional(v.unknown()),
  ref: OptionalTextSchema,
  repoUrl: TextSchema,
  wikiPath: OptionalTextSchema
}

const RawProjectEntrySchema = v.looseObject(RawProjectEntryEntries)

export const ProjectEntrySchema = v.pipe(
  RawProjectEntrySchema,
  v.transform(input => {
    if (input.checkoutPath !== undefined || input.localPath !== undefined || input.path !== undefined) {
      throw new Error(`Project ${input.id} must not store developer-local checkout paths`)
    }

    const managedRepoPath: string | undefined = input.managedRepoPath ?? join('.code-wiki', 'repos', input.id)
    return {
      displayName: input.displayName ?? input.id,
      id: input.id,
      ...(input.exclude === undefined ? {} : { exclude: input.exclude }),
      ...(input.include === undefined ? {} : { include: input.include }),
      ...(managedRepoPath === undefined ? {} : { managedRepoPath }),
      ref: input.ref ?? input.defaultBranch ?? 'HEAD',
      repoUrl: input.repoUrl,
      wikiPath: input.wikiPath ?? join('.code-wiki', 'projects', input.id)
    }
  })
)
export type ProjectEntry = v.InferOutput<typeof ProjectEntrySchema>

export const ProjectsDocumentSchema = v.pipe(
  v.looseObject({
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
  v.looseObject({
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
      wikiPath: input.wikiPath ?? '.code-wiki/wiki'
    }
  })
)
export type EmbeddedProject = v.InferOutput<typeof EmbeddedProjectSchema>

export const ProjectMetadataSchema = v.pipe(
  v.looseObject({
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

export const WikiIndexPageSchema = v.looseObject({
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
  v.looseObject({
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

export const WikiVersionSchema = v.looseObject({
  branch: TextSchema,
  commit: TextSchema,
  path: TextSchema,
  ref: TextSchema,
  scannedAt: TextSchema
})
export type WikiVersion = v.InferOutput<typeof WikiVersionSchema>

export const WikiVersionsDocumentSchema = v.pipe(
  v.looseObject({
    projectId: TextSchema,
    schemaVersion: v.literal(1),
    versions: v.array(WikiVersionSchema)
  }),
  v.transform(input => ({
    projectId: input.projectId,
    schemaVersion: 1 as const,
    versions: [...input.versions]
      .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt) || a.commit.localeCompare(b.commit))
      .filter(
        (version, index, versions) => versions.findIndex(candidate => candidate.commit === version.commit) === index
      )
  }))
)
export type WikiVersionsDocument = v.InferOutput<typeof WikiVersionsDocumentSchema>
