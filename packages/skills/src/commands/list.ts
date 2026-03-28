import { consola } from 'consola'
import { z } from 'incur'

import { Lock } from '../lock.js'
import { formatDisplayPath, resolveScope } from '../scope.js'

export const listOptionsSchema = z.object({
  global: z.boolean().optional(),
  json: z.boolean().optional()
})

export type ListCommandContext = {
  options: z.infer<typeof listOptionsSchema>
}

export async function listCommand(context: ListCommandContext) {
  const scope = resolveScope(context.options.global ?? false)
  const lock = await Lock.ensure(scope)

  const entries = Object.entries(lock.skills)
    .map(([name, skill]) => ({
      name,
      commit: skill.commit,
      path: skill.installPath,
      scope: lock.scope,
      source: skill.source
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (context.options.json) {
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`)
    return
  }

  if (entries.length === 0) {
    consola.info(`No skills installed in ${formatScope(scope)}.`)
    return
  }

  consola.info(`Installed ${entries.length} ${entries.length === 1 ? 'skill' : 'skills'} in ${formatScope(scope)}`)
  process.stdout.write(`${formatList(entries)}\n`)
}

type ListEntry = {
  commit: string
  name: string
  path: string
  scope: string
  source: string
}

function formatScope(scope: ReturnType<typeof resolveScope>): string {
  return scope.scope === 'global'
    ? `global (${formatDisplayPath(scope.globalDir)})`
    : `project (${formatDisplayPath(process.cwd())})`
}

function formatList(entries: ListEntry[]): string {
  const groups = new Map<string, string[]>()
  for (const entry of entries) {
    const sourceSkills = groups.get(entry.source) ?? []
    sourceSkills.push(entry.name)
    groups.set(entry.source, sourceSkills)
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([source, skills]) => [
      bold(formatDisplayPath(source)),
      ...skills.sort((a, b) => a.localeCompare(b)).map(skill => `  - ${skill}`)
    ])
    .join('\n')
}

function bold(value: string): string {
  return `\u001B[1m${value}\u001B[22m`
}
