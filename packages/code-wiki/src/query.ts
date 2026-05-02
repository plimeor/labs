import { join } from 'node:path'

import * as v from 'valibot'

import { Files } from './files.js'
import { readProjects, requireProject } from './projects.js'
import { runRuntime } from './runtime/index.js'
import {
  type ProjectEntry,
  ProjectMetadataSchema,
  type WikiIndexDocument,
  WikiIndexDocumentSchema,
  type WikiIndexPage,
  WikiVersionsDocumentSchema
} from './types.js'
import { ensureRuntime, readEmbeddedProject, resolveWorkspace, statePath, type Workspace } from './workspace.js'

export type QueryRequest = {
  commits?: string[]
  projectId?: string
  question: string
}

type QueryProject = {
  project: ProjectEntry
  wikiRoot: string
}

type QuerySnapshot = {
  branch: string
  commit: string
  ref: string
  root: string
  scannedAt: string
}

type SnapshotContext = {
  index: WikiIndexDocument
  snapshot: QuerySnapshot
}

const maxSnapshots = 5
const maxSnapshotContextLength = 90_000

export async function answerQuery(request: QueryRequest): Promise<string> {
  const workspace = await resolveWorkspace()
  const runtime = await ensureRuntime(workspace)
  const queryProject = await resolveQueryProject(workspace, request)
  const snapshots = selectSnapshots(await readSnapshots(queryProject.wikiRoot), request.commits)
  const contexts = await Promise.all(
    snapshots.map(async snapshot => ({
      index: await Files.readJson(join(snapshot.root, 'index.json'), input => v.parse(WikiIndexDocumentSchema, input)),
      snapshot
    }))
  )
  const prompt = await buildQueryPrompt(queryProject.project, request.question, contexts)

  return runRuntime({
    cwd: workspace.root,
    prompt,
    runtime
  })
}

async function resolveQueryProject(workspace: Workspace, request: QueryRequest): Promise<QueryProject> {
  if (workspace.config.mode === 'embedded') {
    const project = await readEmbeddedProject(workspace)
    if (request.projectId && request.projectId !== project.id) {
      throw new Error(`Unknown project: ${request.projectId}`)
    }

    return {
      project,
      wikiRoot: statePath(workspace, 'wiki')
    }
  }

  const document = await readProjects(workspace)
  const project = request.projectId
    ? requireProject(document, request.projectId)
    : inferProjectFromQuestion(request.question, document.projects)

  return {
    project,
    wikiRoot: join(workspace.root, project.wikiPath)
  }
}

function inferProjectFromQuestion(question: string, projects: ProjectEntry[]): ProjectEntry {
  if (projects.length === 1) {
    return projects[0]
  }

  const normalized = question.toLowerCase()
  const project = projects.find(
    candidate =>
      normalized.includes(candidate.id.toLowerCase()) ||
      normalized.includes((candidate.displayName ?? candidate.id).toLowerCase())
  )
  if (!project) {
    throw new Error('Unable to infer project from question. Use --project <id>.')
  }

  return project
}

async function readSnapshots(wikiRoot: string): Promise<QuerySnapshot[]> {
  const versionsPath = join(wikiRoot, 'versions.json')
  const snapshots: QuerySnapshot[] = []
  if (await Files.pathExists(versionsPath)) {
    const document = await Files.readJson(versionsPath, input => v.parse(WikiVersionsDocumentSchema, input))
    snapshots.push(
      ...document.versions.map(version => ({
        branch: version.branch,
        commit: version.commit,
        ref: version.ref,
        root: join(wikiRoot, version.path),
        scannedAt: version.scannedAt
      }))
    )
  }

  if (await Files.pathExists(join(wikiRoot, 'metadata.json'))) {
    const metadata = await Files.readJson(join(wikiRoot, 'metadata.json'), input =>
      v.parse(ProjectMetadataSchema, input)
    )
    snapshots.push({
      branch: metadata.branch,
      commit: metadata.lastScannedCommit,
      ref: metadata.ref,
      root: wikiRoot,
      scannedAt: metadata.lastScannedAt
    })
  }

  const byCommit = new Map<string, QuerySnapshot>()
  for (const snapshot of snapshots.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))) {
    byCommit.set(snapshot.commit, snapshot)
  }

  const unique = [...byCommit.values()]
  if (unique.length === 0) {
    throw new Error('No scanned wiki versions found. Run `code-wiki scan` first.')
  }

  return unique
}

function selectSnapshots(snapshots: QuerySnapshot[], commits: string[] | undefined): QuerySnapshot[] {
  if (!commits || commits.length === 0) {
    return snapshots.slice(-maxSnapshots)
  }

  return commits.map(commit => resolveSnapshot(commit, snapshots))
}

function resolveSnapshot(input: string, snapshots: QuerySnapshot[]): QuerySnapshot {
  const matches = snapshots.filter(
    snapshot => snapshot.commit.startsWith(input) || snapshot.ref === input || snapshot.branch === input
  )
  if (matches.length === 0) {
    throw new Error(`Unknown scanned commit or ref: ${input}`)
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous scanned commit or ref: ${input}`)
  }

  return matches[0]
}

async function buildQueryPrompt(project: ProjectEntry, question: string, contexts: SnapshotContext[]): Promise<string> {
  const terms = queryTerms(question)
  const sections = [
    'You are CodeWiki QA. Answer using only the provided generated wiki snapshots.',
    'Do not rely on framework release memory unless the wiki context includes supporting source paths or symbols.',
    'When comparing versions, separate observed source evidence from inference and cite commit refs plus source paths.',
    'If the wiki context is insufficient, say exactly what is missing.',
    '',
    `Project: ${project.id}`,
    `Question: ${question}`,
    '',
    '## Available Snapshots',
    ...contexts.map(
      context =>
        `- ${context.snapshot.ref} ${context.snapshot.commit} (${context.snapshot.branch}) scanned at ${context.snapshot.scannedAt}`
    ),
    '',
    '## Version Deltas',
    ...formatVersionDeltas(contexts),
    ''
  ]

  for (const context of contexts) {
    sections.push(await formatSnapshotContext(context, terms))
  }

  return `${sections.join('\n')}\n`
}

function formatVersionDeltas(contexts: SnapshotContext[]): string[] {
  if (contexts.length < 2) {
    return ['- Only one snapshot is available; answer as a single-version source question.']
  }

  const lines: string[] = []
  for (let index = 1; index < contexts.length; index += 1) {
    const previous = contexts[index - 1]
    const current = contexts[index]
    const previousPages = pageMap(previous.index.pages)
    const currentPages = pageMap(current.index.pages)
    const added = [...currentPages.keys()].filter(id => !previousPages.has(id)).sort((a, b) => a.localeCompare(b))
    const removed = [...previousPages.keys()].filter(id => !currentPages.has(id)).sort((a, b) => a.localeCompare(b))
    const changed = [...currentPages.entries()]
      .filter(([id, page]) => previousPages.get(id)?.contentHash !== page.contentHash)
      .map(([id]) => id)
      .sort((a, b) => a.localeCompare(b))

    lines.push(`- ${previous.snapshot.ref} -> ${current.snapshot.ref}`)
    lines.push(`  - Added pages: ${formatInlineList(added)}`)
    lines.push(`  - Removed pages: ${formatInlineList(removed)}`)
    lines.push(`  - Changed pages: ${formatInlineList(changed)}`)
  }

  return lines
}

function pageMap(pages: WikiIndexPage[]): Map<string, WikiIndexPage> {
  return new Map(pages.map(page => [page.id, page]))
}

async function formatSnapshotContext(context: SnapshotContext, terms: string[]): Promise<string> {
  const lines = [
    `## Snapshot ${context.snapshot.ref} ${context.snapshot.commit}`,
    '',
    `Branch: ${context.snapshot.branch}`,
    `Scanned at: ${context.snapshot.scannedAt}`,
    ''
  ]
  let remaining = maxSnapshotContextLength

  for (const { page, text } of await rankedPages(context.snapshot.root, context.index.pages, terms)) {
    if (remaining <= 0) {
      break
    }

    const excerpt = text.slice(0, remaining)
    lines.push(`### ${page.id} (${page.path})`, '', excerpt.trimEnd(), '')
    remaining -= excerpt.length
  }

  return lines.join('\n')
}

async function rankedPages(
  root: string,
  pages: WikiIndexPage[],
  terms: string[]
): Promise<{ page: WikiIndexPage; rank: number; text: string }[]> {
  const loaded: { page: WikiIndexPage; rank: number; text: string }[] = []
  for (const page of pages) {
    const path = join(root, page.path)
    if (!(await Files.pathExists(path))) {
      continue
    }

    const text = await Files.readText(path)
    loaded.push({ page, rank: pageRank(page, terms, text), text })
  }

  return loaded.sort((a, b) => a.rank - b.rank || a.page.id.localeCompare(b.page.id))
}

function pageRank(page: WikiIndexPage, terms: string[], body: string): number {
  const text =
    `${page.id} ${page.title} ${page.summary} ${page.sourceRefs.join(' ')} ${page.symbols.join(' ')} ${body}`.toLowerCase()
  const relevance = terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0)
  if (relevance > 0) {
    return -100 - relevance
  }

  if (page.id === 'overview') {
    return 0
  }

  if (page.id === 'index') {
    return 1
  }

  if (page.kind === 'contract') {
    return 2
  }

  if (page.id === 'module.root') {
    return 3
  }

  if (page.id.startsWith('module.packages.')) {
    return 4
  }

  if (page.id.startsWith('module.src.')) {
    return 5
  }

  return 10
}

function queryTerms(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^\p{L}\p{N}._-]+/u)
    .map(term => term.trim())
    .filter(term => term.length >= 2)
}

function formatInlineList(values: string[]): string {
  if (values.length === 0) {
    return 'none'
  }

  return values.slice(0, 20).join(', ')
}
