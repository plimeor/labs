import { log } from '@clack/prompts'
import * as v from 'valibot'

import { addProject, readProjects, updateProject } from '../projects.js'
import { resolveWorkspace } from '../workspace.js'

export const projectAddArgsSchema = v.object({
  project: v.pipe(v.string(), v.trim(), v.minLength(1))
})

export const projectAddOptionsSchema = v.object({
  branch: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  commit: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  repo: v.pipe(v.string(), v.trim(), v.minLength(1)),
  tag: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)))
})

export const projectSetArgsSchema = v.object({
  project: v.pipe(v.string(), v.trim(), v.minLength(1))
})

export const projectSetOptionsSchema = v.object({
  branch: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  commit: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  repo: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  tag: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1)))
})

export type ProjectAddCommandContext = {
  args: v.InferOutput<typeof projectAddArgsSchema>
  options: v.InferOutput<typeof projectAddOptionsSchema>
}

export type ProjectSetCommandContext = {
  args: v.InferOutput<typeof projectSetArgsSchema>
  options: v.InferOutput<typeof projectSetOptionsSchema>
}

export async function projectAddCommand(context: ProjectAddCommandContext) {
  assertSingleRefOption(context.options)
  const workspace = await resolveWorkspace()
  const project = await addProject(workspace, {
    branch: context.options.branch,
    commit: context.options.commit,
    id: context.args.project,
    repoUrl: context.options.repo,
    tag: context.options.tag
  })
  log.success(`Registered ${project.id} from ${project.repoUrl} at ${formatProjectRef(project)}`)
}

export async function projectSetCommand(context: ProjectSetCommandContext) {
  assertSingleRefOption(context.options)
  const workspace = await resolveWorkspace()
  const project = await updateProject(workspace, context.args.project, {
    branch: context.options.branch,
    commit: context.options.commit,
    repoUrl: context.options.repo,
    tag: context.options.tag
  })
  log.success(`Updated ${project.id} to ${project.repoUrl} at ${formatProjectRef(project)}`)
}

export async function projectListCommand() {
  const workspace = await resolveWorkspace()
  const document = await readProjects(workspace)
  if (document.projects.length === 0) {
    log.info('No projects registered')
    return
  }

  process.stdout.write(
    `${document.projects.map(project => `${project.id}\t${project.repoUrl}\t${formatProjectRef(project)}`).join('\n')}\n`
  )
}

function assertSingleRefOption(options: { branch?: string; commit?: string; tag?: string }): void {
  if ([options.branch, options.commit, options.tag].filter(Boolean).length > 1) {
    throw new Error('Use only one of --branch, --commit, or --tag')
  }
}

function formatProjectRef(project: { branch?: string; commit?: string; tag?: string }): string {
  return project.commit ?? project.branch ?? project.tag ?? 'HEAD'
}
