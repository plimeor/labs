import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { consola } from 'consola'
import { z } from 'incur'

import { Manifest } from '../manifest.js'
import { formatDisplayPath, resolveScope } from '../scope.js'

export const migrateArgsSchema = z.object({ input: z.string().optional() })
export const migrateOptionsSchema = z.object({
  global: z.boolean().optional(),
  output: z.string().optional()
})

export type MigrateCommandContext = {
  args: z.infer<typeof migrateArgsSchema>
  options: z.infer<typeof migrateOptionsSchema>
}

export async function migrateCommand(context: MigrateCommandContext) {
  const cwd = process.cwd()
  const scope = resolveScope(context.options.global ?? false)
  const inputPath = resolveMigrateInputPath({
    cwd,
    global: context.options.global ?? false,
    input: context.args.input
  })
  const outputPath = context.options.output ? resolve(cwd, context.options.output) : scope.manifestPath
  consola.start(`Reading legacy lock from ${formatDisplayPath(inputPath)}`)
  const lock = JSON.parse(await readFile(inputPath, 'utf-8'))
  const manifest = migrateLockToManifest(lock, scope.scope)

  consola.start(`Writing ${formatScope(scope)} manifest to ${formatDisplayPath(outputPath)}`)
  await Manifest.write(outputPath, manifest)
  consola.success(`Migrated ${plural(manifest.skills.length, 'skill')} to ${formatDisplayPath(outputPath)}`)
}

function resolveMigrateInputPath(options: { cwd: string; global: boolean; input?: string }): string {
  if (options.input) {
    return resolve(options.cwd, options.input)
  }

  if (options.global) {
    return resolve(homedir(), '.agents', '.skill-lock.json')
  }

  return resolve(options.cwd, 'skills-lock.json')
}

function migrateLockToManifest(lock: unknown, scope: Manifest.Scope = 'global') {
  if (!isRecord(lock) || !isRecord(lock.skills)) {
    throw new Error('Lock file must contain a skills object')
  }

  let manifest = Manifest.createEmpty(scope)
  for (const [skillName, entry] of Object.entries(lock.skills)) {
    if (!isRecord(entry)) {
      continue
    }

    const source = formatSource(entry)
    if (!source) {
      continue
    }

    manifest = Manifest.upsertSkill(manifest, {
      name: skillName,
      path: formatSkillPath(entry, skillName),
      ref: typeof entry.ref === 'string' && entry.ref ? entry.ref : undefined,
      source
    })
  }

  return manifest
}

function formatSource(entry: Record<string, unknown>): string {
  if (typeof entry.source === 'string' && entry.source.trim()) {
    return entry.source.trim()
  }

  if (typeof entry.sourceUrl === 'string' && entry.sourceUrl.trim()) {
    return entry.sourceUrl.trim()
  }

  return ''
}

function formatSkillPath(entry: Record<string, unknown>, skillName: string): string {
  if (typeof entry.skillPath === 'string' && entry.skillPath.trim()) {
    const skillPath = entry.skillPath.trim()
    return skillPath.endsWith('/SKILL.md') ? dirname(skillPath) : skillPath
  }

  return `skills/${skillName}`
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function formatScope(scope: ReturnType<typeof resolveScope>): string {
  return scope.scope === 'global'
    ? `global (${formatDisplayPath(scope.globalDir)})`
    : `project (${formatDisplayPath(process.cwd())})`
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
