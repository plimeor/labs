import * as v from 'valibot'

export const CodeWikiConfigSchema = v.strictObject({
  schemaVersion: v.literal(1)
})
export type CodeWikiConfig = v.InferOutput<typeof CodeWikiConfigSchema>

export const ProjectIdSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
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

export const ProjectEntrySchema = v.pipe(
  v.strictObject({
    branch: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
    commit: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
    id: ProjectIdSchema,
    repoUrl: v.pipe(v.string(), v.trim(), v.minLength(1)),
    tag: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)))
  }),
  v.check(input => [input.branch, input.commit, input.tag].filter(Boolean).length <= 1, 'Use only one project ref')
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
      schemaVersion: input.schemaVersion
    }
  })
)
export type ProjectsDocument = v.InferOutput<typeof ProjectsDocumentSchema>

export const ProjectMetadataSchema = v.strictObject({
  branch: v.pipe(v.string(), v.trim(), v.minLength(1)),
  lastScannedAt: v.pipe(v.string(), v.trim(), v.minLength(1)),
  lastScannedCommit: v.pipe(v.string(), v.trim(), v.minLength(1)),
  projectId: v.pipe(v.string(), v.trim(), v.minLength(1)),
  ref: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  repoUrl: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  schemaVersion: v.literal(1)
})
export type ProjectMetadata = v.InferOutput<typeof ProjectMetadataSchema>

export const WikiPageKindSchema = v.picklist(['overview', 'index', 'module', 'contract'])
export type WikiPageKind = v.InferOutput<typeof WikiPageKindSchema>

export const WikiPageAuthoritySchema = v.literal('generated')
export type WikiPageAuthority = v.InferOutput<typeof WikiPageAuthoritySchema>

const FallbackTextArraySchema = v.pipe(
  v.unknown(),
  v.transform(input => (Array.isArray(input) ? input : [])),
  v.array(v.pipe(v.string(), v.trim(), v.minLength(1)))
)

export const WikiIndexPageSchema = v.strictObject({
  authority: WikiPageAuthoritySchema,
  contentHash: v.pipe(v.string(), v.trim(), v.minLength(1)),
  dependsOn: v.optional(v.array(v.pipe(v.string(), v.trim(), v.minLength(1)))),
  id: v.pipe(v.string(), v.trim(), v.minLength(1)),
  kind: WikiPageKindSchema,
  lastScannedCommit: v.pipe(v.string(), v.trim(), v.minLength(1)),
  path: v.pipe(v.string(), v.trim(), v.minLength(1)),
  sourceRefs: FallbackTextArraySchema,
  summary: v.pipe(v.string(), v.trim(), v.minLength(1)),
  symbols: FallbackTextArraySchema,
  title: v.pipe(v.string(), v.trim(), v.minLength(1))
})
export type WikiIndexPage = v.InferOutput<typeof WikiIndexPageSchema>

export const WikiIndexDocumentSchema = v.strictObject({
  commit: v.pipe(v.string(), v.trim(), v.minLength(1)),
  pages: v.array(WikiIndexPageSchema),
  projectId: v.pipe(v.string(), v.trim(), v.minLength(1)),
  schemaVersion: v.literal(1)
})
export type WikiIndexDocument = v.InferOutput<typeof WikiIndexDocumentSchema>
