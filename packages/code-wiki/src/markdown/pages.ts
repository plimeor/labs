import { createHash } from 'node:crypto'

import type { WikiPageAuthority, WikiPageKind } from '../types.js'

export type PageInput = {
  authority?: WikiPageAuthority
  body: string
  generatedFromCommit: string
  id: string
  kind: WikiPageKind
  lastVerifiedAt: string
  sourceRefs: string[]
  symbols?: string[]
  title: string
}

export type RenderedPage = {
  content: string
  contentHash: string
}

export function renderGeneratedPage(input: PageInput): RenderedPage {
  const authority = input.authority ?? 'generated'
  const symbols = input.symbols ?? []
  const contentHash = `sha256:${hashContent({
    body: input.body,
    generatedFromCommit: input.generatedFromCommit,
    id: input.id,
    kind: input.kind,
    sourceRefs: input.sourceRefs,
    symbols,
    title: input.title
  })}`

  const frontmatter = [
    '---',
    `id: ${input.id}`,
    `kind: ${input.kind}`,
    `title: ${yamlScalar(input.title)}`,
    `authority: ${authority}`,
    'sourceRefs:',
    ...input.sourceRefs.map(value => `  - ${yamlScalar(value)}`),
    'symbols:',
    ...symbols.map(value => `  - ${yamlScalar(value)}`),
    `generatedFromCommit: ${input.generatedFromCommit}`,
    `contentHash: ${contentHash}`,
    `lastVerifiedAt: ${input.lastVerifiedAt}`,
    '---',
    ''
  ].join('\n')

  return {
    content: `${frontmatter}${input.body.trimEnd()}\n`,
    contentHash
  }
}

export function readAuthority(markdown: string): WikiPageAuthority | undefined {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/)
  const authority = match?.[1]?.match(/^authority:\s*(.+)$/m)?.[1]?.trim()
  if (authority === 'generated' || authority === 'human-corrected') {
    return authority
  }

  return undefined
}

export function isHumanAuthority(authority: WikiPageAuthority | undefined): authority is 'human-corrected' {
  return authority === 'human-corrected'
}

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'root'
}

export function markdownList(items: string[]): string {
  if (items.length === 0) {
    return '- None observed.'
  }

  return items.map(item => `- ${item}`).join('\n')
}

function hashContent(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function yamlScalar(input: string): string {
  return JSON.stringify(input)
}
