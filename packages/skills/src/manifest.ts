import { readFile } from 'node:fs/promises'

import { isNotFound, isRecord, omitUndefined, optionalText, requireText } from './json.js'
import type { Scope as ResolvedScope } from './scope.js'
import { writeTextFilePreservingFile } from './state-file.js'

export namespace Manifest {
  export type Scope = 'global' | 'project'

  export type Skill = {
    commit?: string
    name: string
    path?: string
    ref?: string
    source: string
  }

  export type SourceSkill = Omit<Skill, 'source'>

  export type Source = {
    commit?: string
    ref?: string
    skills: 'all' | SourceSkill[]
    source: string
  }

  export type Document = {
    schemaVersion: 1
    scope: Scope
    sources?: Source[]
    skills: Skill[]
  }

  type NormalizedDocument = Document & { sources: Source[] }

  export type ReadOptions = {
    expectedScope?: Scope
  }

  export function createEmpty(scope: Scope): Document {
    return buildDocument(scope, [], [])
  }

  function parseJson(json: string): Document {
    return normalize(JSON.parse(json))
  }

  function normalize(input: unknown): NormalizedDocument {
    if (!isRecord(input)) {
      throw new Error('Manifest must be a JSON object')
    }

    if (input.schemaVersion !== 1) {
      throw new Error('Unsupported manifest schemaVersion')
    }

    if (input.scope !== 'global' && input.scope !== 'project') {
      throw new Error('Unsupported manifest scope')
    }

    const scope = input.scope

    if (Array.isArray(input.sources)) {
      return normalizeSourceDocument(scope, input.sources)
    }

    if (Array.isArray(input.skills)) {
      return normalizeLegacySkillDocument(scope, input.skills)
    }

    throw new Error('Manifest sources must be an array')
  }

  function normalizeLegacySkillDocument(scope: Scope, inputSkills: unknown[]): NormalizedDocument {
    const seenNames = new Set<string>()
    const skills = inputSkills.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new Error(`Manifest skill at index ${index} must be an object`)
      }

      const skill = normalizeSkill(entry, index)
      if (seenNames.has(skill.name)) {
        throw new Error(`Duplicate manifest skill: ${skill.name}`)
      }
      seenNames.add(skill.name)
      return skill
    })

    return buildDocument(scope, skills, [])
  }

  function normalizeSourceDocument(scope: Scope, inputSources: unknown[]): NormalizedDocument {
    const explicitSkills: Skill[] = []
    const allSources: Source[] = []

    for (const [index, entry] of inputSources.entries()) {
      if (!isRecord(entry)) {
        throw new Error(`Manifest source at index ${index} must be an object`)
      }

      const source = requireText(entry.source, `Manifest source at index ${index} source`)
      const ref = optionalText(entry.ref, 'Optional manifest source field ref')
      const commit = optionalText(entry.commit, 'Optional manifest source field commit')
      if (ref && commit) {
        throw new Error(`Manifest source ${source} cannot specify both ref and commit`)
      }

      if (entry.skills === 'all') {
        allSources.push(omitUndefined({ commit, ref, source, skills: 'all' }))
        continue
      }

      if (!Array.isArray(entry.skills)) {
        throw new Error(`Manifest source ${source} skills must be an array or "all"`)
      }

      for (const [skillIndex, skillEntry] of entry.skills.entries()) {
        if (!isRecord(skillEntry)) {
          throw new Error(`Manifest source ${source} skill at index ${skillIndex} must be an object`)
        }

        explicitSkills.push(normalizeSkill({ commit, ref, ...skillEntry, source }, skillIndex))
      }
    }

    assertUniqueSkillNames(explicitSkills)
    return buildDocument(scope, explicitSkills, allSources)
  }

  function buildDocument(scope: Scope, skillInputs: Skill[], allSourceInputs: Source[]): NormalizedDocument {
    const skills = [...skillInputs].sort((a, b) => a.name.localeCompare(b.name))
    assertUniqueSkillNames(skills)
    const allSources = normalizeAllSources(allSourceInputs)

    const sources = [...allSources, ...groupSkillsBySource(skills)].sort(compareSources)

    return {
      schemaVersion: 1,
      scope,
      sources,
      skills
    }
  }

  export async function read(scope: ResolvedScope): Promise<Document>
  export async function read(path: string, options?: ReadOptions): Promise<Document>
  export async function read(location: ResolvedScope | string, options: ReadOptions = {}): Promise<Document> {
    const manifest = parseJson(await readFile(resolvePath(location), 'utf-8'))
    return assertExpectedScope(manifest, resolveExpectedScope(location, options))
  }

  function serialize(manifest: Document): string {
    const document = normalize(manifest)
    return `${JSON.stringify({ schemaVersion: document.schemaVersion, scope: document.scope, sources: document.sources }, null, 2)}\n`
  }

  export async function ensure(scope: ResolvedScope): Promise<Document> {
    try {
      return await read(scope)
    } catch (error) {
      if (!isNotFound(error)) {
        throw error
      }

      const manifest = createEmpty(scope.scope)
      await write(scope, manifest)
      return manifest
    }
  }

  export async function write(scope: ResolvedScope, manifest: Document): Promise<void>
  export async function write(path: string, manifest: Document): Promise<void>
  export async function write(location: ResolvedScope | string, manifest: Document): Promise<void> {
    const path = resolvePath(location)
    const expectedScope = typeof location === 'string' ? undefined : location.scope
    const document = assertExpectedScope(normalize(manifest), expectedScope)
    await writeTextFilePreservingFile(path, serialize(document))
  }

  export function upsertSkill(manifest: Document, skillInput: Skill): Document {
    const normalized = normalize(manifest)
    const skill = normalizeSkill(skillInput, 0)
    const skills = normalized.skills.filter(entry => entry.name !== skill.name)
    skills.push(skill)
    return buildDocument(
      normalized.scope,
      skills,
      normalized.sources.filter(source => source.skills === 'all')
    )
  }

  export function upsertAllSource(manifest: Document, sourceInput: Source): Document {
    const normalized = normalize(manifest)
    const source = normalizeAllSources([{ ...sourceInput, skills: 'all' }])[0]
    const skills = normalized.skills.filter(skill => !matchesSourceTarget(skill, source))
    const allSources = normalized.sources.filter(entry => entry.skills === 'all' && !matchesSourceTarget(entry, source))
    allSources.push(source)
    return buildDocument(normalized.scope, skills, allSources)
  }

  export function removeSkill(manifest: Document, skillNameInput: string): Document {
    const normalized = normalize(manifest)
    const skillName = requireText(skillNameInput, 'Skill name')
    const nextSkills = normalized.skills.filter(skill => skill.name !== skillName)
    if (nextSkills.length === normalized.skills.length) {
      throw new Error(`Manifest skill not found: ${skillName}`)
    }

    return buildDocument(
      normalized.scope,
      nextSkills,
      normalized.sources.filter(source => source.skills === 'all')
    )
  }

  export function defaultPath(skillName: string): string {
    return `skills/${requireText(skillName, 'Skill name')}`
  }

  export function allSourceRequests(manifest: Document): Source[] {
    return normalize(manifest).sources.filter(source => source.skills === 'all')
  }

  export function withResolvedAllSources(manifest: Document, resolvedSkills: Skill[]): Document {
    const normalized = normalize(manifest)
    return buildDocument(normalized.scope, [...normalized.skills, ...resolvedSkills], [])
  }

  function assertUniqueSkillNames(skills: Skill[]): void {
    const seenNames = new Set<string>()
    for (const skill of skills) {
      if (seenNames.has(skill.name)) {
        throw new Error(`Duplicate manifest skill: ${skill.name}`)
      }
      seenNames.add(skill.name)
    }
  }

  function normalizeAllSources(sources: Source[]): Source[] {
    const seenSources = new Set<string>()
    const allSources: Source[] = []

    for (const sourceInput of sources) {
      const source = requireText(sourceInput.source, 'Manifest source')
      const ref = optionalText(sourceInput.ref, 'Optional manifest source field ref')
      const commit = optionalText(sourceInput.commit, 'Optional manifest source field commit')
      if (ref && commit) {
        throw new Error(`Manifest source ${source} cannot specify both ref and commit`)
      }

      const key = sourceTargetKey({ commit, ref, source, skills: 'all' })
      if (seenSources.has(key)) {
        continue
      }
      seenSources.add(key)
      allSources.push(omitUndefined({ commit, ref, source, skills: 'all' }))
    }

    return allSources
  }

  function compareSources(a: Source, b: Source): number {
    return sourceTargetKey(a).localeCompare(sourceTargetKey(b))
  }

  function sourceTargetKey(source: Source): string {
    return [source.source, source.commit ?? source.ref ?? 'HEAD'].join('\0')
  }

  function matchesSourceTarget(skill: Skill | Source, source: Source): boolean {
    return (
      sourceTargetKey({ commit: skill.commit, ref: skill.ref, skills: 'all', source: skill.source }) ===
      sourceTargetKey(source)
    )
  }

  function groupSkillsBySource(skills: Skill[]): Source[] {
    const groups = new Map<string, SourceSkill[]>()

    for (const skill of skills) {
      const sourceSkills = groups.get(skill.source) ?? []
      sourceSkills.push(omitUndefined({ commit: skill.commit, name: skill.name, path: skill.path, ref: skill.ref }))
      groups.set(skill.source, sourceSkills)
    }

    return [...groups.entries()].map(([source, sourceSkills]) => ({
      source,
      skills: sourceSkills.sort((a, b) => a.name.localeCompare(b.name))
    }))
  }

  function normalizeSkill(input: Record<string, unknown>, index: number): Skill {
    const name = requireText(input.name, `Manifest skill at index ${index} name`)
    if (name.includes('/') || name.includes('\\')) {
      throw new Error(`Manifest skill ${name} must not contain path separators`)
    }

    const source = requireText(input.source, `Manifest skill ${name} source`)
    const path = optionalText(input.path, 'Optional manifest field path')
    const ref = optionalText(input.ref, 'Optional manifest field ref')
    const commit = optionalText(input.commit, 'Optional manifest field commit')

    if (ref && commit) {
      throw new Error(`Manifest skill ${name} cannot specify both ref and commit`)
    }

    return omitUndefined({
      commit,
      name,
      path,
      ref,
      source
    })
  }

  function assertScope(manifest: Document, expectedScope: Scope): Document {
    if (manifest.scope !== expectedScope) {
      throw new Error(`Manifest scope mismatch: expected ${expectedScope}, found ${manifest.scope}`)
    }

    return manifest
  }

  function assertExpectedScope(manifest: Document, expectedScope?: Scope): Document {
    if (!expectedScope) {
      return manifest
    }

    return assertScope(manifest, expectedScope)
  }

  function resolvePath(location: ResolvedScope | string): string {
    return typeof location === 'string' ? location : location.manifestPath
  }

  function resolveExpectedScope(location: ResolvedScope | string, options: ReadOptions): Scope | undefined {
    return typeof location === 'string' ? options.expectedScope : location.scope
  }
}
