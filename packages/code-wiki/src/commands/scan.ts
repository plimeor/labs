import { join } from 'node:path'

import { log } from '@clack/prompts'
import * as Git from '@plimeor/git-kit'
import * as v from 'valibot'

import { Files } from '../files'
import { readProjects, requireProject } from '../projects'
import { readMetadata, scanRepository } from '../scanner/index'
import {
  codeWikiPath,
  type ProjectEntry,
  ProjectIdSchema,
  type ProjectMetadata,
  WikiIndexDocumentSchema
} from '../types'
import { resolveWorkspace } from '../workspace'

export const scanArgsSchema = v.object({
  project: v.optional(ProjectIdSchema)
})

export type ScanCommandContext = {
  args: v.InferOutput<typeof scanArgsSchema>
}

export async function scanCommand(context: ScanCommandContext) {
  const workspace = await resolveWorkspace()
  await scanShared(workspace, context.args.project)
}

async function scanShared(workspace: Awaited<ReturnType<typeof resolveWorkspace>>, projectId?: string): Promise<void> {
  const document = await readProjects(workspace)
  const projects = projectId ? [requireProject(document, projectId)] : document.projects
  if (projects.length === 0) {
    log.info('No projects registered')
    return
  }

  let scanned = 0
  for (const project of projects) {
    const repoPath = join(workspace.root, codeWikiPath('repos', project.id))
    const ref = projectRef(project)
    log.info(`Fetching ${project.id}`)
    await Git.clone({ path: repoPath, repo: project.repo, skipExisting: true })
    const latest = await Git.fetch({ path: repoPath, ref })
    const wikiRoot = join(workspace.root, codeWikiPath('projects', project.id))
    const metadata = await readMetadata(join(wikiRoot, 'metadata.json'))
    if (await isSharedScanUpToDate(wikiRoot, project, metadata, latest, ref)) {
      log.info(`${project.id} is up to date at ${latest.HEAD.slice(0, 7)}`)
      continue
    }

    await Git.switch({ detach: true, path: repoPath, ref: latest.HEAD })
    log.info(`Scanning ${project.id} at ${latest.HEAD.slice(0, 7)}`)
    await scanRepository({
      branch: latest.ref,
      commit: latest.HEAD,
      project,
      ref,
      repoRoot: repoPath,
      wikiRoot
    })
    scanned += 1
    log.success(`Scanned ${project.id}`)
  }

  if (scanned === 0) {
    log.success(projectId ? `${projectId} is up to date` : 'All registered projects are up to date')
  }
}

function projectRef(project: ProjectEntry): string {
  return project.ref ?? 'HEAD'
}

async function isSharedScanUpToDate(
  wikiRoot: string,
  project: ProjectEntry,
  metadata: ProjectMetadata | undefined,
  latest: { HEAD: string; ref: string },
  ref: string
): Promise<boolean> {
  if (!metadata) {
    return false
  }

  if (
    metadata.artifactVersion === 2 &&
    metadata.lastScannedCommit === latest.HEAD &&
    metadata.branch === latest.ref &&
    metadata.projectId === project.id &&
    metadata.ref === ref &&
    metadata.repo === project.repo
  ) {
    return hasRequiredWikiArtifacts(wikiRoot)
  }

  return false
}

async function hasRequiredWikiArtifacts(wikiRoot: string): Promise<boolean> {
  const requiredFiles = ['AGENTS.md', 'overview.md', 'index.md', 'index.json', 'metadata.json', 'log.md']
  const results = await Promise.all(requiredFiles.map(path => Files.pathExists(join(wikiRoot, path))))
  if (!results.every(Boolean)) {
    return false
  }

  const requiredDirectories = ['modules', 'contracts', 'diagrams']
  const directoryResults = await Promise.all(requiredDirectories.map(path => isDirectory(join(wikiRoot, path))))
  if (!directoryResults.every(Boolean)) {
    return false
  }

  let indexDocument: v.InferOutput<typeof WikiIndexDocumentSchema>
  try {
    indexDocument = await Files.readJson(join(wikiRoot, 'index.json'), input => v.parse(WikiIndexDocumentSchema, input))
  } catch (error) {
    if (Files.isNotFound(error) || isInvalidGeneratedIndex(error)) {
      return false
    }
    throw error
  }

  const pageResults = await Promise.all(indexDocument.pages.map(page => Files.pathExists(join(wikiRoot, page.path))))
  return pageResults.every(Boolean)
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Files.statPath(path)).isDirectory()
  } catch (error) {
    if (Files.isNotFound(error)) {
      return false
    }
    throw error
  }
}

function isInvalidGeneratedIndex(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.name === 'ValiError')
}
