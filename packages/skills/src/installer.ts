import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, normalize, resolve, sep } from 'node:path'

import type { Checkout } from './checkout.js'
import { Manifest } from './manifest.js'
import type { Scope } from './scope.js'

export type InstallResult = {
  installPath: string
  sourcePath: string
}

export async function installSkill(
  skill: Manifest.Skill,
  checkout: Checkout.Result,
  scope: Scope
): Promise<InstallResult> {
  const sourcePath = resolveSkillSourcePath(checkout.dir, skill)
  const installPath = join(scope.installDir, safeFileName(skill.name))

  await assertSkillDirectory(sourcePath, skill.name)
  await mkdir(scope.installDir, { recursive: true })
  await rm(installPath, { force: true, recursive: true })
  await cp(sourcePath, installPath, { recursive: true })

  return { installPath, sourcePath }
}

export async function removeInstalledSkill(skillName: string, scope: Scope): Promise<void> {
  await rm(join(scope.installDir, safeFileName(skillName)), { force: true, recursive: true })
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

function safeFileName(value: string): string {
  const name = basename(value.trim())
  if (!name || name === '.' || name === '..') {
    throw new Error(`Invalid skill name: ${value}`)
  }
  return name
}
