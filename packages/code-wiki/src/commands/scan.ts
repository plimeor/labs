import { join } from 'node:path'

import { log } from '@clack/prompts'
import * as v from 'valibot'
import { $ } from 'zx'

import { Files } from '../files.js'
import { ensureManagedClone, fetchProjectRef, readGitIdentity } from '../git.js'
import { readProjects, requireProject } from '../projects.js'
import { readMetadata, scanRepository } from '../scanner/index.js'
import { codeWikiPath, type ProjectEntry, type ProjectMetadata, TextSchema } from '../types.js'
import { readEmbeddedProject, resolveWorkspace, statePath } from '../workspace.js'

export const scanArgsSchema = v.object({
  project: v.optional(TextSchema)
})

export type ScanCommandContext = {
  args: v.InferOutput<typeof scanArgsSchema>
}

export async function scanCommand(context: ScanCommandContext) {
  const workspace = await resolveWorkspace()
  if (workspace.config.mode === 'shared') {
    await scanShared(workspace, context.args.project)
    return
  }

  await scanEmbedded(workspace)
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
    const repoPath = managedRepoPath(workspace.root, project)
    log.info(`Fetching ${project.id}`)
    await ensureManagedClone(project.repoUrl, repoPath)
    const latest = await fetchProjectRef(repoPath, project.ref)
    const wikiRoot = join(workspace.root, project.wikiPath)
    const metadata = await readMetadata(join(wikiRoot, 'metadata.json'))
    if (!projectId && isSharedScanUpToDate(project, metadata, latest) && (await isWikiRootContractCurrent(wikiRoot))) {
      log.info(`${project.id} is up to date at ${latest.commit.slice(0, 7)}`)
      continue
    }

    await checkoutProject(repoPath, latest.commit)
    log.info(`Scanning ${project.id} at ${latest.commit.slice(0, 7)}`)
    await scanRepository({
      branch: latest.branch,
      commit: latest.commit,
      project,
      ref: latest.ref,
      repoRoot: repoPath,
      wikiRoot
    })
    scanned += 1
    log.success(`Scanned ${project.id}`)
  }

  if (scanned === 0) {
    log.success('All registered projects are up to date')
  }
}

async function scanEmbedded(workspace: Awaited<ReturnType<typeof resolveWorkspace>>): Promise<void> {
  const project = await readEmbeddedProject(workspace)
  const git = await readGitIdentity(workspace.root)
  const wikiRoot = statePath(workspace, 'wiki')
  const metadata = await readMetadata(join(wikiRoot, 'metadata.json'))
  if (metadata?.lastScannedCommit === git.commit && (await isWikiRootContractCurrent(wikiRoot))) {
    log.success(`Embedded wiki is up to date at ${git.commit.slice(0, 7)}`)
    return
  }

  await scanRepository({
    branch: git.branch,
    commit: git.commit,
    ref: git.commit,
    repoRoot: git.root,
    project: {
      ...project,
      repoUrl: git.repoUrl ?? project.repoUrl
    },
    wikiRoot
  })
  log.success(`Scanned embedded repository at ${git.commit.slice(0, 7)}`)
}

function managedRepoPath(root: string, project: ProjectEntry): string {
  return join(root, project.managedRepoPath ?? codeWikiPath('repos', project.id))
}

function isSharedScanUpToDate(
  project: ProjectEntry,
  metadata: ProjectMetadata | undefined,
  latest: { branch: string; commit: string; ref: string }
): boolean {
  if (!metadata) {
    return false
  }

  return (
    metadata.lastScannedCommit === latest.commit &&
    metadata.branch === latest.branch &&
    metadata.projectId === project.id &&
    metadata.ref === latest.ref &&
    metadata.repoUrl === project.repoUrl &&
    sameStringArray(metadata.include, project.include) &&
    sameStringArray(metadata.exclude, project.exclude)
  )
}

function sameStringArray(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right
  }

  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

async function isWikiRootContractCurrent(wikiRoot: string): Promise<boolean> {
  return Files.pathExists(join(wikiRoot, 'AGENTS.md'))
}

async function checkoutProject(repoPath: string, commit: string): Promise<void> {
  await $({ cwd: repoPath, quiet: true })`git checkout --detach ${commit}`
}
