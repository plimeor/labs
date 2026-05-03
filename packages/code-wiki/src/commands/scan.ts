import { join } from 'node:path'

import { log } from '@clack/prompts'
import * as Git from '@plimeor/git-kit'
import * as v from 'valibot'

import { readProjects, requireProject } from '../projects.js'
import { readMetadata, scanRepository } from '../scanner/index.js'
import { codeWikiPath, type ProjectEntry, type ProjectMetadata } from '../types.js'
import { resolveWorkspace } from '../workspace.js'

export const scanArgsSchema = v.object({
  project: v.optional(v.pipe(v.string(), v.minLength(1)))
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
    await Git.clone({ path: repoPath, repo: project.repoUrl, skipExisting: true })
    const latest = await Git.fetch({ path: repoPath, ref })
    const wikiRoot = join(workspace.root, codeWikiPath('projects', project.id))
    const metadata = await readMetadata(join(wikiRoot, 'metadata.json'))
    if (isSharedScanUpToDate(project, metadata, latest, ref)) {
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
    log.success('All registered projects are up to date')
  }
}

function projectRef(project: ProjectEntry): string {
  return project.ref ?? 'HEAD'
}

function isSharedScanUpToDate(
  project: ProjectEntry,
  metadata: ProjectMetadata | undefined,
  latest: { HEAD: string; ref: string },
  ref: string
): boolean {
  if (!metadata) {
    return false
  }

  return (
    metadata.lastScannedCommit === latest.HEAD &&
    metadata.branch === latest.ref &&
    metadata.projectId === project.id &&
    metadata.ref === ref &&
    metadata.repoUrl === project.repoUrl
  )
}
