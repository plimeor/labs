import { log } from '@clack/prompts'
import * as v from 'valibot'

import { addProject, readProjects, updateProject } from '../projects.js'
import { splitCommaList } from '../strings.js'
import { TextSchema } from '../types.js'
import { resolveWorkspace } from '../workspace.js'

export const projectAddArgsSchema = v.object({
  project: TextSchema
})

export const projectAddOptionsSchema = v.object({
  commit: v.optional(TextSchema),
  exclude: v.optional(TextSchema),
  include: v.optional(TextSchema),
  ref: v.optional(TextSchema),
  repo: TextSchema
})

export const projectSetArgsSchema = v.object({
  project: TextSchema
})

export const projectSetOptionsSchema = v.object({
  commit: v.optional(TextSchema),
  exclude: v.optional(TextSchema),
  include: v.optional(TextSchema),
  ref: v.optional(TextSchema),
  repo: v.optional(TextSchema)
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
  const ref = resolveRefOptions(context.options)
  const workspace = await resolveWorkspace()
  const project = await addProject(workspace, {
    exclude: splitCommaList(context.options.exclude),
    id: context.args.project,
    include: splitCommaList(context.options.include),
    ref,
    repoUrl: context.options.repo
  })
  log.success(`Registered ${project.id} from ${project.repoUrl} at ${project.ref}`)
}

export async function projectSetCommand(context: ProjectSetCommandContext) {
  const ref = resolveRefOptions(context.options)
  const workspace = await resolveWorkspace()
  const project = await updateProject(workspace, context.args.project, {
    exclude: splitCommaList(context.options.exclude),
    include: splitCommaList(context.options.include),
    ref,
    repoUrl: context.options.repo
  })
  log.success(`Updated ${project.id} to ${project.repoUrl} at ${project.ref}`)
}

export async function projectListCommand() {
  const workspace = await resolveWorkspace()
  const document = await readProjects(workspace)
  if (document.projects.length === 0) {
    log.info('No projects registered')
    return
  }

  process.stdout.write(
    `${document.projects.map(project => `${project.id}\t${project.repoUrl}\t${project.ref}`).join('\n')}\n`
  )
}

function resolveRefOptions(options: { commit?: string; ref?: string }): string | undefined {
  if (options.commit && options.ref) {
    throw new Error('Use only one of --ref or --commit')
  }

  return options.commit ?? options.ref
}
