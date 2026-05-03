import { log } from '@clack/prompts'
import * as v from 'valibot'

import { addProject, readProjects, updateProject } from '../projects.js'
import { ProjectIdSchema } from '../types.js'
import { resolveWorkspace } from '../workspace.js'

export const projectAddArgsSchema = v.object({
  project: ProjectIdSchema
})

export const projectAddOptionsSchema = v.object({
  ref: v.optional(v.pipe(v.string(), v.minLength(1))),
  repo: v.pipe(v.string(), v.minLength(1))
})

export const projectSetArgsSchema = v.object({
  project: ProjectIdSchema
})

export const projectSetOptionsSchema = v.object({
  ref: v.optional(v.pipe(v.string(), v.minLength(1)))
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
  const workspace = await resolveWorkspace()
  const project = await addProject(workspace, {
    id: context.args.project,
    ref: context.options.ref,
    repo: context.options.repo
  })
  log.success(`Registered ${project.id} from ${project.repo} at ${formatProjectRef(project)}`)
}

export async function projectSetCommand(context: ProjectSetCommandContext) {
  assertHasMutationOption(context.options)
  const workspace = await resolveWorkspace()
  const project = await updateProject(workspace, context.args.project, {
    ref: context.options.ref
  })
  log.success(`Updated ${project.id} to ${project.repo} at ${formatProjectRef(project)}`)
}

export async function projectListCommand() {
  const workspace = await resolveWorkspace()
  const document = await readProjects(workspace)
  if (document.projects.length === 0) {
    log.info('No projects registered')
    return
  }

  process.stdout.write(
    `${document.projects.map(project => `${project.id}\t${project.repo}\t${formatProjectRef(project)}`).join('\n')}\n`
  )
}

function assertHasMutationOption(options: { ref?: string }): void {
  if (!options.ref) {
    throw new Error('Use --ref to update the project ref')
  }
}

function formatProjectRef(project: { ref?: string }): string {
  return project.ref ?? 'HEAD'
}
