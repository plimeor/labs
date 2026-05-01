import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { cancel, isCancel, log, multiselect, tasks } from '@clack/prompts'
import { z } from 'incur'

import { Checkout } from '../checkout.js'
import { type InstallResult, installSkill } from '../installer.js'
import { Lock } from '../lock.js'
import { Manifest } from '../manifest.js'
import { formatDisplayPath, resolveScope } from '../scope.js'

export const addArgsSchema = z.object({ source: z.string() })
export const addOptionsSchema = z
  .object({
    all: z.boolean().optional(),
    commit: z.string().optional(),
    global: z.boolean().optional(),
    ref: z.string().optional(),
    skill: z.array(z.string()).optional()
  })
  .refine(options => !options.commit || !options.ref, {
    message: 'add cannot specify both --commit and --ref'
  })
  .refine(options => !options.all || normalizeSkills(options.skill ?? []).length === 0, {
    message: 'add cannot specify both --all and --skill'
  })

export type AddCommandContext = {
  args: z.infer<typeof addArgsSchema>
  options: z.infer<typeof addOptionsSchema>
}

export async function addCommand(context: AddCommandContext) {
  const scope = resolveScope(context.options.global ?? false)
  log.step(`Using ${formatScope(scope)} skills state`)

  const request = checkoutRequest(context)
  log.step(`Resolving ${formatCheckoutTarget(request)}`)
  await Checkout.withAll([request], async checkouts => {
    const checkout = Checkout.requireResult(checkouts, request, context.args.source)
    const selectionLock = await readLockOrEmpty(scope)
    const skills = await resolveSkills(context, checkout.dir, selectionLock)
    if (skills.length === 0) {
      log.info('No new skills selected.')
      return
    }

    let manifest = await Manifest.ensure(scope)
    let lock = await Lock.ensure(scope)
    log.info(`Installing ${skills.length} skills into ${formatDisplayPath(scope.installDir)}`)
    const installResults = new Map<string, InstallResult>()
    await tasks(
      skills.map(skill => ({
        title: `Install ${skill.name}`,
        task: async () => {
          const result = await installSkillWithContext(skill, checkout, scope)
          installResults.set(skill.name, result)
          return `Installed ${formatDisplayPath(result.installPath)}`
        }
      }))
    )
    for (const skill of skills) {
      const result = installResults.get(skill.name)
      if (!result) {
        throw new Error(`Missing install result for ${skill.name}`)
      }
      lock = Lock.setSkill(
        lock,
        skill.name,
        Lock.createEntry(skill, checkout, result.installPath, new Date().toISOString())
      )
    }

    manifest = context.options.all
      ? Manifest.upsertAllSource(manifest, {
          commit: context.options.commit,
          ref: context.options.ref,
          skills: 'all',
          source: context.args.source
        })
      : skills.reduce((nextManifest, skill) => Manifest.upsertSkill(nextManifest, skill), manifest)

    await Manifest.write(scope, manifest)
    await Lock.write(scope, lock)
    log.success(`Updated ${formatDisplayPath(scope.manifestPath)} and ${formatDisplayPath(scope.lockPath)}`)
  })
}

function checkoutRequest({ args, options }: AddCommandContext): Checkout.Request {
  return {
    commit: options.commit,
    ref: options.ref,
    source: args.source
  }
}

async function resolveSkills(
  { args, options }: AddCommandContext,
  checkoutDir: string,
  lock: Lock.Document
): Promise<Manifest.Skill[]> {
  const skillNames = await resolveSkillNames(options, checkoutDir, lock)
  return skillNames.map(name => ({
    commit: options.commit,
    name,
    path: Manifest.defaultPath(name),
    ref: options.ref,
    source: args.source
  }))
}

async function resolveSkillNames(
  options: AddCommandContext['options'],
  checkoutDir: string,
  lock: Lock.Document
): Promise<string[]> {
  if (options.all) {
    return discoverSkillNames(checkoutDir)
  }

  const explicitSkillNames = normalizeSkills(options.skill ?? [])
  if (explicitSkillNames.length > 0) {
    return explicitSkillNames
  }

  return promptSkillNames(checkoutDir, lock)
}

async function readLockOrEmpty(scope: ReturnType<typeof resolveScope>): Promise<Lock.Document> {
  try {
    return await Lock.read(scope)
  } catch (error) {
    if (isNotFoundError(error)) {
      return { schemaVersion: 1, scope: scope.scope, skills: {} }
    }

    throw error
  }
}

async function discoverSkillNames(checkoutDir: string): Promise<string[]> {
  return (await discoverSkills(checkoutDir, 'add --all')).map(skill => skill.name)
}

type DiscoveredSkill = {
  description?: string
  name: string
}

async function discoverSkills(checkoutDir: string, label: string): Promise<DiscoveredSkill[]> {
  const skillsDir = join(checkoutDir, 'skills')
  const entries = await readdir(skillsDir, { withFileTypes: true })
  const skillNames = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
  if (skillNames.length === 0) {
    throw new Error(`${label} found no skills`)
  }

  return Promise.all(
    skillNames.map(async name => ({
      description: await readSkillDescription(join(skillsDir, name, 'SKILL.md')),
      name
    }))
  )
}

async function promptSkillNames(checkoutDir: string, lock: Lock.Document): Promise<string[]> {
  const skills = await discoverSkills(checkoutDir, 'add')
  const installedNames = new Set(Object.keys(lock.skills))
  const installableSkills = skills.filter(skill => !installedNames.has(skill.name))
  if (installableSkills.length === 0) {
    log.info('All skills from this source are already installed. Run skills sync if you need to refresh them.')
    return []
  }

  const selected = await multiselect({
    message: 'Select skills to install',
    options: sortPromptSkills(skills, installedNames).map(skill => ({
      disabled: installedNames.has(skill.name),
      hint: skill.description,
      label: formatSkillLabel(skill, installedNames.has(skill.name)),
      value: skill.name
    })),
    required: false
  })

  if (isCancel(selected)) {
    cancel('No skills selected.')
    return []
  }

  return normalizeSkills(selected.filter(skillName => !installedNames.has(skillName)))
}

function sortPromptSkills(skills: DiscoveredSkill[], installedNames: Set<string>): DiscoveredSkill[] {
  return [...skills].sort((a, b) => {
    const aInstalled = installedNames.has(a.name)
    const bInstalled = installedNames.has(b.name)
    if (aInstalled !== bInstalled) {
      return aInstalled ? 1 : -1
    }

    return a.name.localeCompare(b.name)
  })
}

async function readSkillDescription(skillFile: string): Promise<string | undefined> {
  try {
    return parseFrontmatterDescription(await readFile(skillFile, 'utf-8'))
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined
    }

    throw error
  }
}

function parseFrontmatterDescription(markdown: string): string | undefined {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return undefined
  }

  const frontmatter: string[] = []
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') {
      break
    }
    frontmatter.push(line)
  }

  for (let index = 0; index < frontmatter.length; index++) {
    const match = frontmatter[index]?.match(/^description:\s*(.*)$/)
    if (!match) {
      continue
    }

    const value = match[1].trim()
    if (value === '>' || value === '>-' || value === '|' || value === '|-') {
      const blockLines: string[] = []
      for (const line of frontmatter.slice(index + 1)) {
        if (/^[A-Za-z0-9_-]+:\s*/.test(line)) {
          break
        }
        blockLines.push(line.trim())
      }
      return normalizeDescription(blockLines.join(value.startsWith('>') ? ' ' : '\n'))
    }

    return normalizeDescription(unquote(value))
  }

  return undefined
}

function formatSkillLabel(skill: DiscoveredSkill, installed: boolean): string {
  return installed ? `${skill.name} (installed)` : skill.name
}

function normalizeDescription(value: string): string | undefined {
  const description = value.replace(/\s+/g, ' ').trim()
  return description || undefined
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }

  return value
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function normalizeSkills(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

async function installSkillWithContext(
  skill: Manifest.Skill,
  checkout: Checkout.Result,
  scope: ReturnType<typeof resolveScope>
) {
  try {
    return await installSkill(skill, checkout, scope)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to install ${skill.name}: ${message}`)
  }
}

function formatScope(scope: ReturnType<typeof resolveScope>): string {
  return scope.scope === 'global'
    ? `global (${formatDisplayPath(scope.globalDir)})`
    : `project (${formatDisplayPath(process.cwd())})`
}

function formatCheckoutTarget(request: Checkout.Request): string {
  const source = formatDisplayPath(request.source)
  if (request.commit) {
    const commit = request.commit === 'local' ? request.commit : request.commit.slice(0, 7)
    return `${source} at commit ${commit}`
  }

  return request.ref ? `${source} at ref ${request.ref}` : `${source} at HEAD`
}
