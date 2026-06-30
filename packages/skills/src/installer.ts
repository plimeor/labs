import { createHash, type Hash } from 'node:crypto'
import { cp, lstat, mkdir, readdir, readFile, readlink, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, normalize, resolve, sep } from 'node:path'

import { Manifest } from './manifest'
import type { Scope } from './scope'

export type InstallResult = {
  contentHash: string
  installPath: string
  sourcePath: string
}

export async function installSkill(
  skill: Manifest.Skill,
  checkout: { directory: string },
  scope: Scope
): Promise<InstallResult> {
  const sourcePath = resolveSkillSourcePath(checkout.directory, skill)
  const installPath = installedSkillPath(skill.name, scope)

  await assertSkillDirectory(sourcePath, skill.name)
  await mkdir(scope.installDir, { recursive: true })
  await rm(installPath, { force: true, recursive: true })
  await cp(sourcePath, installPath, { recursive: true })

  return { contentHash: await hashSkillDirectory(installPath), installPath, sourcePath }
}

export async function sourceSkillContentHash(skill: Manifest.Skill, checkout: { directory: string }): Promise<string> {
  const sourcePath = resolveSkillSourcePath(checkout.directory, skill)
  await assertSkillDirectory(sourcePath, skill.name)
  return await hashSkillDirectory(sourcePath)
}

export async function removeInstalledSkill(skillName: string, scope: Scope): Promise<void> {
  await rm(installedSkillPath(skillName, scope), { force: true, recursive: true })
}

export function installedSkillPath(skillName: string, scope: Scope): string {
  return join(scope.installDir, safeFileName(skillName))
}

export async function isInstalledSkillComplete(skillName: string, scope: Scope): Promise<boolean> {
  const installPath = installedSkillPath(skillName, scope)
  const installedStat = await lstat(installPath).catch(error => {
    if (isNotFoundError(error)) {
      return undefined
    }

    throw error
  })
  if (!installedStat?.isDirectory()) {
    return false
  }

  const skillFileStat = await stat(join(installPath, 'SKILL.md')).catch(error => {
    if (isNotFoundError(error)) {
      return undefined
    }

    throw error
  })

  return skillFileStat?.isFile() ?? false
}

export async function installedSkillContentHash(skillName: string, scope: Scope): Promise<string | undefined> {
  if (!(await isInstalledSkillComplete(skillName, scope))) {
    return undefined
  }

  return await hashSkillDirectory(installedSkillPath(skillName, scope))
}

function resolveSkillSourcePath(checkoutDir: string, skill: Manifest.Skill): string {
  const requestedPath = normalize(skill.path ?? Manifest.defaultPath(skill.name))
  if (
    isAbsolute(requestedPath) ||
    requestedPath === '..' ||
    requestedPath.startsWith(`..${sep}`) ||
    requestedPath.includes(`${sep}..${sep}`)
  ) {
    throw new Error(`Unsafe skill path for ${skill.name}: ${skill.path}`)
  }

  return resolve(checkoutDir, requestedPath)
}

async function assertSkillDirectory(sourcePath: string, skillName: string): Promise<void> {
  const skillStat = await stat(sourcePath).catch(() => {
    throw new Error(`Skill source is not a directory for ${skillName}: ${sourcePath}`)
  })
  if (!skillStat.isDirectory()) {
    throw new Error(`Skill source is not a directory for ${skillName}: ${sourcePath}`)
  }

  const skillFileStat = await stat(join(sourcePath, 'SKILL.md')).catch(() => {
    throw new Error(`Skill source is missing SKILL.md for ${skillName}: ${sourcePath}`)
  })
  if (!skillFileStat.isFile()) {
    throw new Error(`Skill source is missing SKILL.md for ${skillName}: ${sourcePath}`)
  }
}

async function hashSkillDirectory(root: string): Promise<string> {
  const hash = createHash('sha256')
  await updateDirectoryHash(hash, root)
  return `sha256:${hash.digest('hex')}`
}

async function updateDirectoryHash(hash: Hash, root: string, relativeDir = ''): Promise<void> {
  const directory = relativeDir ? join(root, ...relativeDir.split('/')) : root
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
    const entryPath = join(directory, entry.name)
    const entryStat = await lstat(entryPath)

    if (entryStat.isDirectory()) {
      updateHashFields(hash, ['directory', relativePath])
      await updateDirectoryHash(hash, root, relativePath)
      continue
    }

    if (entryStat.isFile()) {
      updateHashFields(hash, ['file', relativePath, await readFile(entryPath)])
      continue
    }

    if (entryStat.isSymbolicLink()) {
      updateHashFields(hash, ['symlink', relativePath, await readlink(entryPath)])
      continue
    }

    throw new Error(`Unsupported installed skill file type: ${entryPath}`)
  }
}

function updateHashFields(hash: Hash, fields: (Buffer | string)[]): void {
  for (const field of fields) {
    const data = typeof field === 'string' ? Buffer.from(field) : field
    hash.update(`${data.byteLength}\0`)
    hash.update(data)
    hash.update('\0')
  }
}

function safeFileName(value: string): string {
  const name = basename(value.trim())
  if (!name || name === '.' || name === '..') {
    throw new Error(`Invalid skill name: ${value}`)
  }
  return name
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
