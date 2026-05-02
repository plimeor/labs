import { join } from 'node:path'

import { cancel, confirm, isCancel, log, multiselect } from '@clack/prompts'
import * as v from 'valibot'

import { Files } from '../files.js'
import { normalizeProjectIds, readProjects, requireProject } from '../projects.js'
import { loadPrd, loadProjectWikiContext, proposeAffectedProjects, runReview } from '../review/index.js'
import { type LoadedPrd, type PrdSource, type RuntimeProjectProposal, TextSchema } from '../types.js'
import { ensureRuntime, readEmbeddedProject, resolveWorkspace, statePath } from '../workspace.js'

export const reviewArgsSchema = v.object({
  prd: v.optional(TextSchema)
})

export const reviewOptionsSchema = v.pipe(
  v.object({
    projects: v.optional(TextSchema),
    text: v.optional(TextSchema),
    url: v.optional(TextSchema)
  }),
  v.check(
    options => [options.text, options.url].filter(Boolean).length <= 1,
    'review accepts only one of --text or --url'
  )
)

export type ReviewCommandContext = {
  args: v.InferOutput<typeof reviewArgsSchema>
  options: v.InferOutput<typeof reviewOptionsSchema>
}

export async function reviewCommand(commandContext: ReviewCommandContext) {
  const workspace = await resolveWorkspace()
  const runtime = await ensureRuntime(workspace)
  const source = resolvePrdSource(commandContext)
  const prd = await loadPrd(source, workspace.root)
  const reportsDir = statePath(workspace, 'reports')
  await Files.ensureDir(reportsDir)

  if (workspace.config.mode === 'shared') {
    const document = await readProjects(workspace)
    const contexts = await Promise.all(
      document.projects.map(project => loadProjectWikiContext(project, join(workspace.root, project.wikiPath)))
    )
    const projectIds = commandContext.options.projects
      ? normalizeProjectIds(commandContext.options.projects)
      : await confirmRuntimeProposal({
          projects: document.projects.map(project => ({
            id: project.id,
            label: project.displayName
          })),
          prd,
          proposal: await proposeAffectedProjects({
            cwd: workspace.root,
            prd,
            projects: contexts,
            runtime
          })
        })
    const selectedProjects = projectIds.map(id => requireProject(document, id))
    const selectedContexts = await Promise.all(
      selectedProjects.map(project => loadProjectWikiContext(project, join(workspace.root, project.wikiPath)))
    )
    const reportPath = await runReview({
      contexts: selectedContexts,
      cwd: workspace.root,
      prd,
      reportsDir,
      runtime
    })
    log.success(`Wrote ${reportPath}`)
    return
  }

  const project = await readEmbeddedProject(workspace)
  const wikiContext = await loadProjectWikiContext(project, statePath(workspace, 'wiki'))
  const reportPath = await runReview({
    contexts: [wikiContext],
    cwd: workspace.root,
    prd,
    reportsDir,
    runtime
  })
  log.success(`Wrote ${reportPath}`)
}

function resolvePrdSource(context: ReviewCommandContext): PrdSource {
  if (context.options.url) {
    return { kind: 'url', url: context.options.url }
  }

  if (context.options.text) {
    return { kind: 'text', text: context.options.text }
  }

  if (context.args.prd) {
    return { kind: 'file', path: context.args.prd }
  }

  throw new Error('review requires a PRD file, --url, or --text')
}

async function confirmRuntimeProposal(input: {
  projects: Array<{ id: string; label: string }>
  prd: LoadedPrd
  proposal: RuntimeProjectProposal
}): Promise<string[]> {
  log.info(`Runtime proposed projects for ${input.prd.label}:`)
  for (const projectId of input.proposal.projectIds) {
    log.info(`- ${projectId}: ${input.proposal.reasons[projectId]}`)
  }

  if (!process.stdin.isTTY) {
    throw new Error('review without --projects requires interactive confirmation')
  }

  const shouldUseProposal = await confirm({
    initialValue: true,
    message: 'Use this project set?'
  })

  if (isCancel(shouldUseProposal)) {
    cancel('Review cancelled before project confirmation.')
    throw new Error('Review cancelled before project confirmation')
  }

  if (shouldUseProposal) {
    return input.proposal.projectIds
  }

  const selected = await multiselect({
    initialValues: input.proposal.projectIds,
    message: 'Select projects for review',
    options: input.projects.map(project => ({
      hint: input.proposal.reasons[project.id],
      label: project.label,
      value: project.id
    })),
    required: true
  })

  if (isCancel(selected)) {
    cancel('Review cancelled before project confirmation.')
    throw new Error('Review cancelled before project confirmation')
  }

  return selected
}
