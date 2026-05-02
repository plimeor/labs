import { join, resolve } from 'node:path'

import { log } from '@clack/prompts'
import * as v from 'valibot'

import { Files } from '../files.js'
import { readProjects, requireProject } from '../projects.js'
import { TextSchema } from '../types.js'
import { readEmbeddedProject, resolveWorkspace, statePath } from '../workspace.js'

export const correctArgsSchema = v.object({
  correction: v.optional(TextSchema),
  project: TextSchema
})

export type CorrectCommandContext = {
  args: v.InferOutput<typeof correctArgsSchema>
}

export async function correctCommand(context: CorrectCommandContext) {
  const workspace = await resolveWorkspace()
  const timestamp = new Date().toISOString()
  const target =
    workspace.config.mode === 'shared'
      ? await sharedCorrectionTarget(workspace, context.args.project, context.args.correction)
      : await embeddedCorrectionTarget(workspace, context.args.project, context.args.correction)
  const correctionContent = await Files.readText(resolve(workspace.root, target.correctionPath))
  const entry = [
    `## ${timestamp} correction`,
    '',
    `- Correction source: ${target.correctionPath}`,
    '- Authority: human-corrected',
    '',
    correctionContent.trim(),
    ''
  ].join('\n')
  const existing = (await Files.pathExists(target.logPath))
    ? await Files.readText(target.logPath)
    : `# ${target.title} Log\n\n`
  await Files.writeText(target.logPath, `${existing.trimEnd()}\n\n${entry}`)
  log.success(`Appended correction to ${target.logPath}`)
}

async function sharedCorrectionTarget(
  workspace: Awaited<ReturnType<typeof resolveWorkspace>>,
  projectId: string,
  correctionPath?: string
) {
  if (!correctionPath) {
    throw new Error('Shared corrections require `code-wiki correct <project> <correction.md>`')
  }

  const document = await readProjects(workspace)
  const project = requireProject(document, projectId)
  return {
    correctionPath,
    logPath: join(workspace.root, project.wikiPath, 'log.md'),
    title: project.displayName
  }
}

async function embeddedCorrectionTarget(
  workspace: Awaited<ReturnType<typeof resolveWorkspace>>,
  firstArg: string,
  secondArg?: string
) {
  const project = await readEmbeddedProject(workspace)
  return {
    correctionPath: secondArg ?? firstArg,
    logPath: statePath(workspace, 'wiki', 'log.md'),
    title: project.displayName
  }
}
