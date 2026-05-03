import { identity as gitIdentity } from '@plimeor/git-kit'
import * as v from 'valibot'

export const CodeWikiConfigSchema = v.strictObject({
  schemaVersion: v.literal(1)
})
export type CodeWikiConfig = v.InferOutput<typeof CodeWikiConfigSchema>

export const ProjectIdInputSchema = v.pipe(v.string(), v.minLength(1), v.transform(gitIdentity))

export const ProjectIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.check(input => input === gitIdentity(input), 'Invalid project id')
)

export function normalizeProjectId(input: unknown): string {
  return v.parse(ProjectIdInputSchema, input)
}

export function codeWikiPath(...segments: string[]): string {
  return ['.code-wiki', ...segments].join('/')
}

export const ProjectEntrySchema = v.pipe(
  v.strictObject({
    id: ProjectIdSchema,
    ref: v.optional(v.pipe(v.string(), v.minLength(1))),
    repo: v.pipe(v.string(), v.minLength(1))
  })
)
export type ProjectEntry = v.InferOutput<typeof ProjectEntrySchema>

export const ProjectsDocumentSchema = v.pipe(
  v.strictObject({
    projects: v.array(ProjectEntrySchema),
    schemaVersion: v.literal(1)
  }),
  v.check(input => {
    const seen = new Set<string>()

    for (const project of input.projects) {
      if (seen.has(project.id)) {
        return false
      }
      seen.add(project.id)
    }

    return true
  }, 'Duplicate project id')
)
export type ProjectsDocument = v.InferOutput<typeof ProjectsDocumentSchema>

export const ProjectMetadataSchema = v.strictObject({
  artifactVersion: v.literal(1),
  branch: v.pipe(v.string(), v.trim(), v.minLength(1)),
  lastScannedAt: v.pipe(v.string(), v.trim(), v.minLength(1)),
  lastScannedCommit: v.pipe(v.string(), v.trim(), v.minLength(1)),
  projectId: ProjectIdSchema,
  ref: v.optional(v.pipe(v.string(), v.minLength(1))),
  repo: v.optional(v.pipe(v.string(), v.minLength(1))),
  schemaVersion: v.literal(1)
})
export type ProjectMetadata = v.InferOutput<typeof ProjectMetadataSchema>

export const WikiPageKindSchema = v.picklist(['overview', 'index', 'module', 'contract'])
export type WikiPageKind = v.InferOutput<typeof WikiPageKindSchema>

export const WikiPageAuthoritySchema = v.literal('generated')
export type WikiPageAuthority = v.InferOutput<typeof WikiPageAuthoritySchema>

const TextArraySchema = v.array(v.pipe(v.string(), v.trim(), v.minLength(1)))

export const WikiIndexPageSchema = v.strictObject({
  authority: WikiPageAuthoritySchema,
  contentHash: v.pipe(v.string(), v.trim(), v.minLength(1)),
  id: v.pipe(v.string(), v.trim(), v.minLength(1)),
  kind: WikiPageKindSchema,
  lastScannedCommit: v.pipe(v.string(), v.trim(), v.minLength(1)),
  path: v.pipe(v.string(), v.trim(), v.minLength(1)),
  sourceRefs: TextArraySchema,
  summary: v.pipe(v.string(), v.trim(), v.minLength(1)),
  symbols: TextArraySchema,
  title: v.pipe(v.string(), v.trim(), v.minLength(1))
})
export type WikiIndexPage = v.InferOutput<typeof WikiIndexPageSchema>

export const WikiIndexDocumentSchema = v.pipe(
  v.strictObject({
    commit: v.pipe(v.string(), v.trim(), v.minLength(1)),
    pages: v.array(WikiIndexPageSchema),
    projectId: ProjectIdSchema,
    schemaVersion: v.literal(1)
  }),
  v.check(input => hasUniqueValues(input.pages.map(page => page.id)), 'Duplicate wiki page id'),
  v.check(input => hasUniqueValues(input.pages.map(page => page.path)), 'Duplicate wiki page path')
)
export type WikiIndexDocument = v.InferOutput<typeof WikiIndexDocumentSchema>

function hasUniqueValues(values: string[]): boolean {
  return new Set(values).size === values.length
}
