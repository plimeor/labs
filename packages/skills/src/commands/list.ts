import { log } from '@clack/prompts'
import type { OutputMode } from '@plimeor/command-kit'
import { type Static, Type } from '@sinclair/typebox'

import { Lock } from '../lock.js'
import { formatDisplayPath, resolveScope } from '../scope.js'

export const listArgsSchema = Type.Object({})
export const listOptionsSchema = Type.Object({
  global: Type.Optional(Type.Boolean()),
  json: Type.Optional(Type.Boolean())
})

export type ListCommandContext = {
  format?: OutputMode
  formatExplicit?: boolean
  options: Static<typeof listOptionsSchema>
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

  if (context.formatExplicit && context.format === 'json') {
    return entries
  }

  if (context.options.json) {
    process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`)
    return entries
  }

  if (entries.length === 0) {
    if (context.format !== 'json') {
      log.info(`No skills installed in ${formatScope(scope)}.`)
    }
    return []
  }

  if (context.format !== 'json') {
    log.info(`Installed ${entries.length} skills in ${formatScope(scope)}`)
    process.stdout.write(`${formatList(entries)}\n`)
  }
  return entries
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
      `\u001B[1m${formatDisplayPath(source)}\u001B[22m`,
      ...skills.sort((a, b) => a.localeCompare(b)).map(skill => `  - ${skill}`)
    ])
    .join('\n')
}
