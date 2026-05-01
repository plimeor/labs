import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { log, tasks } from '@clack/prompts'
import * as v from 'valibot'

import { isNotFound } from '../json.js'
import { Lock } from '../lock.js'
import { Manifest } from '../manifest.js'
import { formatDisplayPath, resolveScope, type Scope } from '../scope.js'
import { nonBlankString, optionalBoolean, optionalString } from './schemas.js'

export const migrateArgsSchema = v.object({
  input: v.optional(nonBlankString('Legacy lock file path to read'))
})
export const migrateOptionsSchema = v.object({
  global: optionalBoolean('Use the global legacy lock and output state'),
  output: optionalString('Manifest path to write instead of the default path')
})

export type MigrateCommandContext = {
  args: v.InferOutput<typeof migrateArgsSchema>
  options: v.InferOutput<typeof migrateOptionsSchema>
}

export async function migrateCommand(context: MigrateCommandContext) {
  const cwd = process.cwd()
  const scope = resolveScope(context.options.global ?? false)
  const inputPath = resolveMigrateInputPath({
    cwd,
    global: context.options.global ?? false,
    globalDir: scope.globalDir,
    input: context.args.input
  })
  const outputPath = context.options.output ? resolve(cwd, context.options.output) : scope.manifestPath
  const lockPath = context.options.output ? join(dirname(outputPath), 'skills.lock.json') : scope.lockPath
  const legacyLock = await readLegacyLockWithProgress(inputPath)
  if (!legacyLock) {
    log.info(`No legacy lock found at ${formatDisplayPath(inputPath)}; nothing to migrate`)
    return
  }

  const migrated = migrateLegacyLock(legacyLock, scope)

  await tasks([
    {
      title: `Writing ${formatScope(scope)} state`,
      task: async () => {
        await Manifest.write(outputPath, migrated.manifest)
        await Lock.write(lockPath, migrated.lock)
        return `Wrote ${formatDisplayPath(outputPath)} and ${formatDisplayPath(lockPath)}`
      }
    }
  ])
  log.success(
    `Migrated ${migrated.manifest.skills.length} skills to ${formatDisplayPath(outputPath)} and ${formatDisplayPath(lockPath)}`
  )
}

async function readLegacyLockWithProgress(path: string): Promise<unknown | undefined> {
  let legacyLock: unknown | undefined
  await tasks([
    {
      title: `Reading legacy lock from ${formatDisplayPath(path)}`,
      task: async () => {
        legacyLock = await readLegacyLock(path)
        if (!legacyLock) {
          return 'No legacy lock found'
        }

        return `Read legacy lock from ${formatDisplayPath(path)}`
      }
    }
  ])
  return legacyLock
}

async function readLegacyLock(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch (error) {
    if (isNotFound(error)) {
      return undefined
    }

    throw error
  }
}

function resolveMigrateInputPath(options: { cwd: string; global: boolean; globalDir: string; input?: string }): string {
  if (options.input) {
    return resolve(options.cwd, options.input)
  }

  if (options.global) {
    return join(options.globalDir, '.skill-lock.json')
  }

  return resolve(options.cwd, 'skills-lock.json')
}

function migrateLegacyLock(lock: unknown, scope: Scope): { lock: Lock.Document; manifest: Manifest.Document } {
  if (!isRecord(lock) || !isRecord(lock.skills)) {
    throw new Error('Lock file must contain a skills object')
  }

  let manifest = Manifest.createEmpty(scope.scope)
  let nextLock: Lock.Document = { schemaVersion: 1, scope: scope.scope, skills: {} }
  const installedAt = new Date().toISOString()
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
    nextLock = Lock.setSkill(nextLock, skillName, {
      commit: formatCommit(entry, source),
      installedAt: formatInstalledAt(entry) ?? installedAt,
      installPath: formatInstallPath(entry, scope, skillName),
      method: 'copy',
      path: formatSkillPath(entry, skillName),
      ref: formatRef(entry),
      source
    })
  }

  return { lock: nextLock, manifest }
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

function formatCommit(entry: Record<string, unknown>, source: string): string {
  const commit = firstText(entry, ['commit', 'resolvedCommit', 'sha', 'revision'])
  if (commit) {
    return commit
  }

  if (isLocalSource(source)) {
    return 'local'
  }

  return formatRef(entry) ?? 'HEAD'
}

function formatInstallPath(entry: Record<string, unknown>, scope: Scope, skillName: string): string {
  return firstText(entry, ['installPath', 'installedPath']) ?? join(scope.installDir, skillName)
}

function formatInstalledAt(entry: Record<string, unknown>): string | undefined {
  return firstText(entry, ['installedAt', 'updatedAt', 'createdAt'])
}

function formatRef(entry: Record<string, unknown>): string | undefined {
  return firstText(entry, ['ref', 'branch', 'tag'])
}

function firstText(entry: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = entry[field]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}

function isLocalSource(source: string): boolean {
  return source.startsWith('/') || source.startsWith('./') || source.startsWith('../')
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function formatScope(scope: ReturnType<typeof resolveScope>): string {
  return scope.scope === 'global'
    ? `global (${formatDisplayPath(scope.globalDir)})`
    : `project (${formatDisplayPath(process.cwd())})`
}
