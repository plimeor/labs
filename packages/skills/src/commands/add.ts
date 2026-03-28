import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { consola } from 'consola'
import { z } from 'incur'

import { Checkout } from '../checkout.js'
import { installSkill } from '../installer.js'
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
  .refine(options => options.all || normalizeSkills(options.skill ?? []).length > 0, {
    message: 'add requires --skill or --all'
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
  consola.start(`Using ${formatScope(scope)} skills state`)
  let manifest = await Manifest.ensure(scope)
  let lock = await Lock.ensure(scope)

  const request = checkoutRequest(context)
  consola.start(`Resolving ${formatCheckoutTarget(request)}`)
  await Checkout.withAll([request], async checkouts => {
    const checkout = Checkout.requireResult(checkouts, request, context.args.source)
    const skills = await resolveSkills(context, checkout.dir)
    consola.info(`Installing ${plural(skills.length, 'skill')} into ${formatDisplayPath(scope.installDir)}`)
    for (const skill of skills) {
      const result = await installSkillWithContext(skill, checkout, scope)
      consola.success(`Installed ${formatDisplayPath(result.installPath)}`)
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
  })

  await Manifest.write(scope, manifest)
  await Lock.write(scope, lock)
  consola.success(`Updated ${formatDisplayPath(scope.manifestPath)} and ${formatDisplayPath(scope.lockPath)}`)
}

function checkoutRequest({ args, options }: AddCommandContext): Checkout.Request {
  return {
    commit: options.commit,
    ref: options.ref,
    source: args.source
  }
}

async function resolveSkills({ args, options }: AddCommandContext, checkoutDir: string): Promise<Manifest.Skill[]> {
  const skillNames = options.all ? await discoverSkillNames(checkoutDir) : normalizeSkills(options.skill ?? [])
  return skillNames.map(name => ({
    commit: options.commit,
    name,
    path: Manifest.defaultPath(name),
    ref: options.ref,
    source: args.source
  }))
}

async function discoverSkillNames(checkoutDir: string): Promise<string[]> {
  const skillsDir = join(checkoutDir, 'skills')
  const entries = await readdir(skillsDir, { withFileTypes: true })
  const skillNames = entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))
  if (skillNames.length === 0) {
    throw new Error('add --all found no skills')
  }

  return skillNames
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
  const target = request.commit ? `commit ${shortCommit(request.commit)}` : request.ref ? `ref ${request.ref}` : 'HEAD'
  return `${formatDisplayPath(request.source)} at ${target}`
}

function shortCommit(commit: string): string {
  return commit === 'local' ? commit : commit.slice(0, 7)
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
