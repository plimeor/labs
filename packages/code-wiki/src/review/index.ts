import { join } from 'node:path'

import * as v from 'valibot'

import { Files } from '../files.js'
import { slugify } from '../markdown/pages.js'
import { runRuntime } from '../runtime/index.js'
import type {
  LoadedPrd,
  PrdSource,
  ProjectEntry,
  ProjectMetadata,
  ReviewContextPage,
  RuntimeId,
  RuntimeProjectProposal,
  WikiIndexDocument,
  WikiIndexPage
} from '../types.js'
import { ProjectMetadataSchema, RuntimeProjectProposalSchema, WikiIndexDocumentSchema } from '../types.js'

export type ProjectWikiContext = {
  humanIndex: string
  index: WikiIndexDocument
  metadata?: ProjectMetadata
  project: ProjectEntry
  wikiRoot: string
}

export async function loadPrd(source: PrdSource, cwd: string): Promise<LoadedPrd> {
  switch (source.kind) {
    case 'file': {
      const path = join(cwd, source.path)
      return {
        content: await Files.readText(path),
        label: source.path,
        source
      }
    }
    case 'url': {
      const response = await fetch(source.url)
      if (!response.ok) {
        throw new Error(`Failed to fetch PRD URL ${source.url}: ${response.status} ${response.statusText}`)
      }

      return {
        content: await response.text(),
        label: source.url,
        source
      }
    }
    case 'text':
      return {
        content: source.text,
        label: 'direct text',
        source
      }
  }
}

export async function loadProjectWikiContext(project: ProjectEntry, wikiRoot: string): Promise<ProjectWikiContext> {
  const index = await Files.readJson(join(wikiRoot, 'index.json'), input => v.parse(WikiIndexDocumentSchema, input))
  const metadata = await Files.readJson(join(wikiRoot, 'metadata.json'), input =>
    v.parse(ProjectMetadataSchema, input)
  ).catch(() => undefined)
  const humanIndex = await Files.readText(join(wikiRoot, 'index.md')).catch(() => '')
  return {
    humanIndex,
    index,
    metadata,
    project,
    wikiRoot
  }
}

export async function proposeAffectedProjects(input: {
  cwd: string
  prd: LoadedPrd
  projects: ProjectWikiContext[]
  runtime: RuntimeId
}): Promise<RuntimeProjectProposal> {
  const prompt = [
    'You are selecting affected projects for a CodeWiki PRD review.',
    'Return JSON only with this shape: {"projects":[{"id":"project-id","reason":"short reason"}]}.',
    'Use only the PRD and routing indexes below.',
    '',
    `PRD source: ${input.prd.label}`,
    '<prd>',
    input.prd.content,
    '</prd>',
    '',
    '<project_indexes>',
    ...input.projects.map(project =>
      [
        `Project: ${project.project.id}`,
        `Latest commit: ${project.metadata?.lastScannedCommit ?? project.index.commit}`,
        'index.json:',
        JSON.stringify(project.index, null, 2),
        'index.md:',
        project.humanIndex
      ].join('\n')
    ),
    '</project_indexes>'
  ].join('\n')
  const output = await runRuntime({
    cwd: input.cwd,
    prompt,
    runtime: input.runtime
  })
  const proposal = parseProjectProposal(output)
  const knownIds = new Set(input.projects.map(project => project.project.id))
  const projectIds = proposal.projectIds.filter(id => knownIds.has(id))
  if (projectIds.length === 0) {
    throw new Error(
      'Runtime proposal did not include any known projects. Use `--projects` to select projects manually.'
    )
  }

  return {
    projectIds,
    reasons: Object.fromEntries(projectIds.map(id => [id, proposal.reasons[id] ?? 'Runtime selected this project.']))
  }
}

export async function runReview(input: {
  contexts: ProjectWikiContext[]
  cwd: string
  prd: LoadedPrd
  reportsDir: string
  runtime: RuntimeId
}): Promise<string> {
  const contextPages = await loadRelevantContextPages(input.prd, input.contexts)
  const prompt = buildReviewPrompt(input.prd, input.contexts, contextPages)
  const agentOutput = await runRuntime({
    cwd: input.cwd,
    prompt,
    runtime: input.runtime
  })
  const report = renderReport(input.prd, input.contexts, contextPages, agentOutput)
  const reportPath = join(input.reportsDir, `${timestampSlug()}-${slugify(input.prd.label)}.md`)
  await Files.writeText(reportPath, report)
  return reportPath
}

export async function loadRelevantContextPages(
  prd: LoadedPrd,
  contexts: ProjectWikiContext[]
): Promise<ReviewContextPage[]> {
  const selected: ReviewContextPage[] = []
  for (const context of contexts) {
    const pages = selectPagesFromIndex(prd.content, context.index.pages)
    for (const page of pages) {
      const content = await Files.readText(join(context.wikiRoot, page.path)).catch(() => '')
      if (content) {
        selected.push({
          content,
          page,
          projectId: context.project.id
        })
      }
    }
  }

  return selected
}

function selectPagesFromIndex(prd: string, pages: WikiIndexPage[]): WikiIndexPage[] {
  const terms = new Set(prd.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? [])
  const scored = pages.map(page => {
    const routeText = [page.id, page.kind, page.title, page.summary, ...page.sourceRefs, ...page.symbols]
      .join(' ')
      .toLowerCase()
    const score =
      (page.kind === 'overview' ? 5 : 0) +
      (page.kind === 'contract' ? 4 : 0) +
      [...terms].reduce((total, term) => total + (routeText.includes(term) ? 1 : 0), 0)
    return { page, score }
  })

  return scored
    .filter(({ page, score }) => score > 0 || page.kind === 'overview' || page.kind === 'contract')
    .sort((a, b) => b.score - a.score || a.page.id.localeCompare(b.page.id))
    .slice(0, 12)
    .map(({ page }) => page)
}

function buildReviewPrompt(prd: LoadedPrd, contexts: ProjectWikiContext[], pages: ReviewContextPage[]): string {
  return [
    'You are writing a CodeWiki PRD implementation review.',
    'Use the provided wiki facts and routing-selected pages. Do not invent code facts.',
    'Distinguish observed wiki facts, PRD-derived requirements, inferred risks, and open questions.',
    'Write Markdown with these sections exactly:',
    '1. Code-level objective',
    '2. Missing requirements',
    '3. Project plans',
    '4. Integration plan',
    '5. Regression scope',
    '6. Open questions',
    '',
    `PRD source: ${prd.label}`,
    '<prd>',
    prd.content,
    '</prd>',
    '',
    '<selected_projects>',
    ...contexts.map(
      context => `${context.project.id} @ ${context.metadata?.lastScannedCommit ?? context.index.commit}`
    ),
    '</selected_projects>',
    '',
    '<wiki_context>',
    ...pages.map(page =>
      [
        `Project: ${page.projectId}`,
        `Page id: ${page.page.id}`,
        `Source refs: ${page.page.sourceRefs.join(', ')}`,
        '<page>',
        page.content,
        '</page>'
      ].join('\n')
    ),
    '</wiki_context>'
  ].join('\n')
}

function renderReport(
  prd: LoadedPrd,
  contexts: ProjectWikiContext[],
  pages: ReviewContextPage[],
  agentOutput: string
): string {
  const body = requireReportSections(agentOutput)
  return [
    '# CodeWiki Review Report',
    '',
    `PRD source: ${prd.label}`,
    `Projects: ${contexts.map(context => context.project.id).join(', ')}`,
    `Routing pages: ${pages.map(page => `${page.projectId}:${page.page.id}`).join(', ')}`,
    '',
    body.trim(),
    ''
  ].join('\n')
}

function requireReportSections(output: string): string {
  const required = [
    'Code-level objective',
    'Missing requirements',
    'Project plans',
    'Integration plan',
    'Regression scope',
    'Open questions'
  ]
  const missing = required.filter(section => !new RegExp(`^#{1,3}\\s+${escapeRegExp(section)}\\b`, 'im').test(output))
  if (missing.length === 0) {
    return output
  }

  throw new Error(`Runtime review output is missing required sections: ${missing.join(', ')}`)
}

function parseProjectProposal(output: string): RuntimeProjectProposal {
  return v.parse(RuntimeProjectProposalSchema, JSON.parse(extractJsonObject(output)))
}

function extractJsonObject(output: string): string {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) {
    return fenced[1]
  }

  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Runtime output did not contain a JSON object')
  }

  return output.slice(start, end + 1)
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
