import { log, tasks } from '@clack/prompts'
import { z } from 'incur'

import { removeInstalledSkill } from '../installer.js'
import { Lock } from '../lock.js'
import { Manifest } from '../manifest.js'
import { formatDisplayPath, resolveScope } from '../scope.js'

export const removeArgsSchema = z.object({ target: z.string().optional() })
export const removeOptionsSchema = z.object({
  global: z.boolean().optional()
})

export type RemoveCommandContext = {
  args: z.infer<typeof removeArgsSchema>
  options: z.infer<typeof removeOptionsSchema>
}

export async function removeCommand(context: RemoveCommandContext) {
  const skillNames = parseSkillNames(context)
  const scope = resolveScope(context.options.global ?? false)
  log.step(`Removing ${skillNames.join(', ')} from ${formatScope(scope)} skills state`)
  let manifest = await Manifest.read(scope)
  let lock = await Lock.ensure(scope)

  for (const skillName of skillNames) {
    manifest = removeManifestSkill(manifest, lock, skillName)
    lock = Lock.removeSkill(lock, skillName)
  }

  await tasks(
    skillNames.map(skillName => ({
      title: `Remove ${skillName}`,
      task: async () => {
        await removeInstalledSkill(skillName, scope)
        return `Removed ${skillName}`
      }
    }))
  )
  await Manifest.write(scope, manifest)
  await Lock.write(scope, lock)
  log.success(
    `Removed ${skillNames.length} skills and updated ${formatDisplayPath(
      scope.manifestPath
    )} plus ${formatDisplayPath(scope.lockPath)}`
  )
}

function parseSkillNames(context: RemoveCommandContext): string[] {
  const skillNames = [...new Set((context.args.target?.split(',') ?? []).map(value => value.trim()).filter(Boolean))]
  if (skillNames.length === 0) {
    throw new Error('remove requires a skill name')
  }

  return skillNames
}

function formatScope(scope: ReturnType<typeof resolveScope>): string {
  return scope.scope === 'global'
    ? `global (${formatDisplayPath(scope.globalDir)})`
    : `project (${formatDisplayPath(process.cwd())})`
}

function removeManifestSkill(manifest: Manifest.Document, lock: Lock.Document, skillName: string): Manifest.Document {
  const lockedSkill = lock.skills[skillName]
  if (!lockedSkill) {
    return Manifest.removeSkill(manifest, skillName)
  }

  const allSource = manifest.sources?.find(source => source.skills === 'all' && matchesAllSource(source, lockedSkill))
  if (!allSource) {
    return Manifest.removeSkill(manifest, skillName)
  }

  const nextSources = (manifest.sources ?? []).flatMap(source => {
    if (source !== allSource) {
      return [source]
    }

    const skills = Object.entries(lock.skills)
      .filter(([name, skill]) => name !== skillName && matchesAllSource(source, skill))
      .map(([name, skill]) => ({
        name,
        path: skill.path
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return skills.length === 0 ? [] : [{ ...source, skills }]
  })

  log.info(`Converted all-skills source ${allSource.source} to an explicit list without ${skillName}`)
  return {
    schemaVersion: manifest.schemaVersion,
    scope: manifest.scope,
    skills: [],
    sources: nextSources
  }
}

function matchesAllSource(source: Manifest.Source, skill: Lock.Entry): boolean {
  if (skill.source !== source.source) {
    return false
  }

  if (source.commit) {
    return skill.commit === source.commit
  }

  if (source.ref) {
    return skill.ref === source.ref
  }

  return !skill.ref
}
