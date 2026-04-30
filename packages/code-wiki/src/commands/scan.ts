import { join } from 'node:path'

import { log } from '@clack/prompts'
import * as v from 'valibot'
import { $ } from 'zx'

import { Files } from '../files.js'
import { ensureManagedClone, fetchProjectRef } from '../git.js'
import { readProjects, requireProject } from '../projects.js'
import { readMetadata, scanRepository } from '../scanner/index.js'
import { codeWikiPath, type ProjectEntry, type ProjectMetadata } from '../types.js'
import { resolveWorkspace } from '../workspace.js'

export const scanArgsSchema = v.object({
  project: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)))
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
    log.info(`Fetching ${project.id}`)
    await ensureManagedClone(project.repoUrl, repoPath)
    const latest = await fetchProjectRef(repoPath, projectRef(project))
    const wikiRoot = join(workspace.root, codeWikiPath('projects', project.id))
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

function projectRef(project: ProjectEntry): string {
  return project.commit ?? project.branch ?? project.tag ?? 'HEAD'
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
    metadata.repoUrl === project.repoUrl
  )
}

async function isWikiRootContractCurrent(wikiRoot: string): Promise<boolean> {
  return Files.pathExists(join(wikiRoot, 'AGENTS.md'))
}

async function checkoutProject(repoPath: string, commit: string): Promise<void> {
  await $({ cwd: repoPath, quiet: true })`git checkout --detach ${commit}`
}
