import { readFile } from 'node:fs/promises'

import type { Checkout } from './checkout.js'
import { isNotFound, isRecord, omitUndefined, optionalText, requireText } from './json.js'
import type { Manifest } from './manifest.js'
import type { Scope } from './scope.js'
import { writeTextFilePreservingFile } from './state-file.js'

export namespace Lock {
  export type Entry = {
    commit: string
    installedAt: string
    installPath: string
    method: 'copy'
    path?: string
    ref?: string
    source: string
  }

  export type Document = {
    schemaVersion: 1
    scope: Manifest.Scope
    skills: Record<string, Entry>
  }

  export type ReadOptions = {
    expectedScope?: Manifest.Scope
  }

  function createEmpty(scope: Manifest.Scope): Document {
    return { schemaVersion: 1, scope, skills: {} }
  }

  function parseJson(json: string): Document {
    return normalize(JSON.parse(json))
  }

  function normalize(input: unknown): Document {
    if (!isRecord(input)) {
      throw new Error('Lock must be a JSON object')
    }

    if (input.schemaVersion !== 1) {
      throw new Error('Unsupported lock schemaVersion')
    }

    if (input.scope !== 'global' && input.scope !== 'project') {
      throw new Error('Unsupported lock scope')
    }

    if (!isRecord(input.skills)) {
      throw new Error('Lock skills must be an object')
    }

    const skills: Record<string, Entry> = {}
    for (const [name, entry] of Object.entries(input.skills).sort(([a], [b]) => a.localeCompare(b))) {
      if (!isRecord(entry)) {
        throw new Error(`Lock skill ${name} must be an object`)
      }

      const skillName = requireText(name, 'Lock skill name')
      if (skillName.includes('/') || skillName.includes('\\')) {
        throw new Error(`Lock skill ${skillName} must not contain path separators`)
      }

      skills[skillName] = normalizeSkill(entry, name)
    }

    return {
      schemaVersion: 1,
      scope: input.scope,
      skills
    }
  }

  export async function read(scope: Scope): Promise<Document>
  export async function read(path: string, options?: ReadOptions): Promise<Document>
  export async function read(location: Scope | string, options: ReadOptions = {}): Promise<Document> {
    const lock = parseJson(await readFile(resolvePath(location), 'utf-8'))
    return assertExpectedScope(lock, resolveExpectedScope(location, options))
  }

  function serialize(lock: Document): string {
    return `${JSON.stringify(normalize(lock), null, 2)}\n`
  }

  export async function ensure(scope: Scope): Promise<Document> {
    try {
      return await read(scope)
    } catch (error) {
      if (!isNotFound(error)) {
        throw error
      }

      const lock = createEmpty(scope.scope)
      await write(scope, lock)
      return lock
    }
  }

  export async function write(scope: Scope, lock: Document): Promise<void>
  export async function write(path: string, lock: Document): Promise<void>
  export async function write(location: Scope | string, lock: Document): Promise<void> {
    const path = resolvePath(location)
    const expectedScope = typeof location === 'string' ? undefined : location.scope
    const document = assertExpectedScope(normalize(lock), expectedScope)
    await writeTextFilePreservingFile(path, serialize(document))
  }

  export function setSkill(lock: Document, skillName: string, lockedSkill: Entry): Document {
    return normalize({
      ...lock,
      skills: {
        ...lock.skills,
        [skillName]: lockedSkill
      }
    })
  }

  export function createEntry(
    skill: Manifest.Skill,
    checkout: Checkout.Result,
    installPath: string,
    installedAt: string
  ): Entry {
    return {
      commit: checkout.commit,
      installedAt,
      installPath,
      method: 'copy',
      path: skill.path,
      ref: skill.ref,
      source: skill.source
    }
  }

  export function removeSkill(lock: Document, skillName: string): Document {
    const skills = { ...lock.skills }
    delete skills[skillName]
    return normalize({ ...lock, skills })
  }

  function normalizeSkill(input: Record<string, unknown>, name: string): Entry {
    const source = requireText(input.source, `Lock skill ${name} source`)
    const commit = requireText(input.commit, `Lock skill ${name} commit`)
    const installedAt = requireText(input.installedAt, `Lock skill ${name} installedAt`)
    const installPath = requireText(input.installPath, `Lock skill ${name} installPath`)
    const method = input.method ?? 'copy'
    const path = optionalText(input.path, 'Optional lock field path')
    const ref = optionalText(input.ref, 'Optional lock field ref')

    if (method !== 'copy') {
      throw new Error(`Unsupported lock skill ${name} install method`)
    }

    return omitUndefined({
      commit,
      installedAt,
      installPath,
      method,
      path,
      ref,
      source
    })
  }

  function assertScope(lock: Document, expectedScope: Manifest.Scope): Document {
    if (lock.scope !== expectedScope) {
      throw new Error(`Lock scope mismatch: expected ${expectedScope}, found ${lock.scope}`)
    }

    return lock
  }

  function assertExpectedScope(lock: Document, expectedScope?: Manifest.Scope): Document {
    if (!expectedScope) {
      return lock
    }

    return assertScope(lock, expectedScope)
  }

  function resolvePath(location: Scope | string): string {
    return typeof location === 'string' ? location : location.lockPath
  }

  function resolveExpectedScope(location: Scope | string, options: ReadOptions): Manifest.Scope | undefined {
    return typeof location === 'string' ? options.expectedScope : location.scope
  }
}
