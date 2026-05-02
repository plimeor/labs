import { log } from '@clack/prompts'
import * as v from 'valibot'

import { addProject, readProjects } from '../projects.js'
import { TextSchema } from '../types.js'
import { resolveWorkspace } from '../workspace.js'

export const projectsAddArgsSchema = v.object({
  project: TextSchema
})

export const projectsAddOptionsSchema = v.object({
  repo: TextSchema
})

export type ProjectsAddCommandContext = {
  args: v.InferOutput<typeof projectsAddArgsSchema>
  options: v.InferOutput<typeof projectsAddOptionsSchema>
}

export async function projectsAddCommand(context: ProjectsAddCommandContext) {
  const workspace = await resolveWorkspace()
  const project = await addProject(workspace, {
    id: context.args.project,
    repoUrl: context.options.repo
  })
  log.success(`Registered ${project.id} from ${project.repoUrl}`)
}

export async function projectsListCommand() {
  const workspace = await resolveWorkspace()
  const document = await readProjects(workspace)
  if (document.projects.length === 0) {
    log.info('No projects registered')
    return
  }

  process.stdout.write(
    `${document.projects.map(project => `${project.id}\t${project.repoUrl}\t${project.defaultBranch}`).join('\n')}\n`
  )
}
