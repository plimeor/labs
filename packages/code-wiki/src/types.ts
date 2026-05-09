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

const StoredTextSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.check(input => input === input.trim(), 'Invalid leading or trailing whitespace')
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
  artifactVersion: v.literal(2),
  branch: StoredTextSchema,
  lastScannedAt: StoredTextSchema,
  lastScannedCommit: StoredTextSchema,
  projectId: ProjectIdSchema,
  ref: v.optional(v.pipe(v.string(), v.minLength(1))),
  repo: v.optional(v.pipe(v.string(), v.minLength(1))),
  schemaVersion: v.literal(1)
})
export type ProjectMetadata = v.InferOutput<typeof ProjectMetadataSchema>

export const WikiPageKindSchema = v.picklist(['overview', 'index', 'module', 'contract', 'diagram'])
export type WikiPageKind = v.InferOutput<typeof WikiPageKindSchema>

export const WikiPageAuthoritySchema = v.literal('generated')
export type WikiPageAuthority = v.InferOutput<typeof WikiPageAuthoritySchema>

const TextArraySchema = v.array(StoredTextSchema)

export const SourceReferenceSchema = v.strictObject({
  commit: StoredTextSchema,
  endLine: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  externalUrl: v.optional(StoredTextSchema),
  packageId: v.optional(StoredTextSchema),
  path: StoredTextSchema,
  projectId: ProjectIdSchema,
  startLine: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  symbolName: v.optional(StoredTextSchema)
})
export type SourceReference = v.InferOutput<typeof SourceReferenceSchema>

export const WikiIndexPageSchema = v.strictObject({
  authority: WikiPageAuthoritySchema,
  contentHash: StoredTextSchema,
  id: StoredTextSchema,
  kind: WikiPageKindSchema,
  lastScannedCommit: StoredTextSchema,
  path: StoredTextSchema,
  sourceReferences: v.array(SourceReferenceSchema),
  sourceRefs: TextArraySchema,
  summary: StoredTextSchema,
  symbols: TextArraySchema,
  title: StoredTextSchema
})
export type WikiIndexPage = v.InferOutput<typeof WikiIndexPageSchema>

export const DiagramNodeKindSchema = v.picklist([
  'repo',
  'workspace',
  'package',
  'app',
  'module',
  'file',
  'symbol',
  'external'
])
export type DiagramNodeKind = v.InferOutput<typeof DiagramNodeKindSchema>

export const DiagramEdgeKindSchema = v.picklist([
  'declares',
  'depends_on',
  'imports',
  'exports',
  'routes_to',
  'calls',
  'configures'
])
export type DiagramEdgeKind = v.InferOutput<typeof DiagramEdgeKindSchema>

export const DiagramDocumentSchema = v.strictObject({
  commit: StoredTextSchema,
  edges: v.array(
    v.strictObject({
      from: StoredTextSchema,
      kind: DiagramEdgeKindSchema,
      sourceRefs: v.array(SourceReferenceSchema),
      to: StoredTextSchema
    })
  ),
  id: StoredTextSchema,
  kind: v.picklist(['workspace', 'dependency', 'module', 'route', 'sequence']),
  mermaidPath: StoredTextSchema,
  nodes: v.array(
    v.strictObject({
      id: StoredTextSchema,
      kind: DiagramNodeKindSchema,
      label: StoredTextSchema,
      sourceRefs: v.array(SourceReferenceSchema)
    })
  ),
  title: StoredTextSchema
})
export type DiagramDocument = v.InferOutput<typeof DiagramDocumentSchema>

export const WikiIndexDocumentSchema = v.pipe(
  v.strictObject({
    commit: StoredTextSchema,
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
