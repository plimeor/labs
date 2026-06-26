import { createHash } from 'node:crypto'
import { lstat, mkdir, open, readFile, readlink, rename, rm, rmdir, stat, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'

import type {
  ExtensionFacet,
  ExtensionIssue,
  ExtensionResourceKind,
  ExtensionResult,
  HarnessContext,
  HarnessExtension,
  HarnessId,
  HookResource,
  McpServerResource
} from '../types'

type SupportedResource = 'skills' | 'mcpServers' | 'hooks'

type ExtensionFacetConfig = {
  harnessId: HarnessId
  context?: HarnessContext
  configDirectory: string
  skillsDirectory?: string
  mcp?: McpExtensionDriver
  hooks?: HookExtensionDriver
}

export type McpExtensionDriver = {
  configFile: string
  canReclaimOnInstall?(input: { extension: HarnessExtension; name: string }): boolean | Promise<boolean>
  currentFingerprint(name: string): Promise<string | undefined>
  install(input: { extensionId: string; name: string; server: McpServerResource }): Promise<InstalledMcpServer>
  remove(name: string): Promise<void>
}

export type HookExtensionDriver = {
  events: readonly string[]
  conflicts(input: { extensionId: string; hooks: HookResource[] }): Promise<ExtensionIssue[]>
  currentFingerprint(hook: InstalledHook): Promise<string | undefined>
  install(input: { extensionId: string; hooks: HookResource[] }): Promise<InstalledHook[]>
  restore(hooks: InstalledHook[]): Promise<void>
  uninstall(hooks: InstalledHook[]): Promise<void>
}

type ExtensionState = {
  extensions: Record<string, InstalledExtension>
}

type InstalledExtension = {
  skills: InstalledSkill[]
  mcpServers: InstalledMcpServer[]
  hooks: InstalledHook[]
}

type InstalledSkill = {
  kind: 'directory-symlink' | 'file-symlink-directory'
  sourcePath: string
  targetPath: string
}

export type InstalledMcpServer = {
  fingerprint: string
  name: string
  server?: McpServerResource
}

export type InstalledHook = {
  command: string
  event: string
  fingerprint: string
  name?: string
  targetPath?: string
}

export type JsonObject = Record<string, unknown>

const STATE_FILE = 'harness-extensions.json'

export function createExtensionFacet(config: ExtensionFacetConfig): ExtensionFacet {
  return {
    async check(extension: HarnessExtension) {
      const issues = compatibilityIssues(config, extension)
      return {
        compatible: issues.length === 0,
        issues
      }
    },

    async install(extension: HarnessExtension) {
      return withConfigLock(config, async () => {
        const state = await readState(config)
        const owned = state.extensions[extension.id]
        const issues = await preflight(config, extension, owned)

        if (issues.length > 0) {
          return extensionResult(issues)
        }

        await uninstallOwned(config, owned)

        const next: InstalledExtension = { hooks: [], mcpServers: [], skills: [] }
        try {
          await installSkills(config, extension, next)
          await installMcpServers(config, extension, next)
          await installHooks(config, extension, next)
        } catch (error) {
          await uninstallOwned(config, next)
          await restoreOwned(config, extension.id, owned)
          throw error
        }

        if (next.skills.length > 0 || next.mcpServers.length > 0 || next.hooks.length > 0) {
          state.extensions[extension.id] = next
        } else {
          delete state.extensions[extension.id]
        }
        await writeState(config, state)

        return extensionResult(issues)
      })
    },

    async uninstall(extensionId: string) {
      return withConfigLock(config, async () => {
        const state = await readState(config)
        const owned = state.extensions[extensionId]
        if (!owned) {
          return extensionResult([])
        }

        const issues = await ownershipConflicts(config, owned)
        if (issues.length > 0) {
          return extensionResult(issues)
        }

        await uninstallOwned(config, owned)
        delete state.extensions[extensionId]
        await writeState(config, state)
        return extensionResult([])
      })
    }
  }
}

function extensionResult(issues: ExtensionIssue[]): ExtensionResult {
  return {
    issues,
    success: issues.length === 0
  }
}

export function configDirectory(home: string | undefined, name: '.claude' | '.codex' | '.kiro' | '.pi/agent'): string {
  return join(home ?? process.env.HOME ?? process.cwd(), name)
}

async function preflight(
  config: ExtensionFacetConfig,
  extension: HarnessExtension,
  owned: InstalledExtension | undefined
): Promise<ExtensionIssue[]> {
  const issues: ExtensionIssue[] = []

  issues.push(...(await ownershipConflicts(config, owned, extension)))
  issues.push(...unsupportedIssues(config, extension))
  issues.push(...unsupportedHookEvents(config, extension))
  issues.push(...(await skillConflicts(config, extension, owned)))
  issues.push(...(await mcpConflicts(config, extension, owned)))
  issues.push(...(await hookConflicts(config, extension, owned)))

  return issues
}

async function ownershipConflicts(
  config: ExtensionFacetConfig,
  owned: InstalledExtension | undefined,
  extension?: HarnessExtension
): Promise<ExtensionIssue[]> {
  if (!owned) {
    return []
  }

  return [
    ...(await ownedSkillConflicts(owned)),
    ...(await ownedMcpConflicts(config, owned, extension)),
    ...(await ownedHookConflicts(config, owned))
  ]
}

function compatibilityIssues(config: ExtensionFacetConfig, extension: HarnessExtension): ExtensionIssue[] {
  return [...unsupportedIssues(config, extension), ...unsupportedHookEvents(config, extension)]
}

function unsupportedIssues(config: ExtensionFacetConfig, extension: HarnessExtension): ExtensionIssue[] {
  const issues: ExtensionIssue[] = []
  const supported = supportedResources(config)

  if (!supported.has('skills')) {
    for (const skill of extension.resources.skills ?? []) {
      issues.push(unsupported(config.harnessId, 'skills', skill))
    }
  }

  if (!supported.has('mcpServers')) {
    for (const name of Object.keys(extension.resources.mcpServers ?? {})) {
      issues.push(unsupported(config.harnessId, 'mcpServers', name))
    }
  }

  if (!supported.has('hooks')) {
    for (const hook of extension.resources.hooks ?? []) {
      issues.push(unsupported(config.harnessId, 'hooks', hook.name))
    }
  }

  return issues
}

function unsupportedHookEvents(config: ExtensionFacetConfig, extension: HarnessExtension): ExtensionIssue[] {
  if (!config.hooks) {
    return []
  }

  const supported = new Set(config.hooks.events)
  return (extension.resources.hooks ?? [])
    .filter(hook => !supported.has(hook.event))
    .map(hook => ({
      kind: 'unsupported',
      reason: `${config.harnessId} adapter does not support hook event ${hook.event}.`,
      resourceKind: 'hooks',
      resourceName: hook.name
    }))
}

function supportedResources(config: ExtensionFacetConfig): Set<SupportedResource> {
  const supported = new Set<SupportedResource>()
  if (config.skillsDirectory) {
    supported.add('skills')
  }
  if (config.mcp) {
    supported.add('mcpServers')
  }
  if (config.hooks) {
    supported.add('hooks')
  }
  return supported
}

function unsupported(harnessId: HarnessId, resourceKind: ExtensionResourceKind, resourceName?: string): ExtensionIssue {
  return {
    kind: 'unsupported',
    reason: `${harnessId} adapter does not support user-scope ${resourceKind} installation.`,
    resourceKind,
    resourceName
  }
}

async function skillConflicts(
  config: ExtensionFacetConfig,
  extension: HarnessExtension,
  owned: InstalledExtension | undefined
): Promise<ExtensionIssue[]> {
  if (!config.skillsDirectory) {
    return []
  }

  const ownedTargets = new Set((owned?.skills ?? []).map(skill => skill.targetPath))
  const issues: ExtensionIssue[] = []

  for (const [index, skillPath] of (extension.resources.skills ?? []).entries()) {
    const sourcePath = resolveExtensionPath(config, skillPath)
    const targetPath = skillTargetPath(config.skillsDirectory, extension.id, skillPath, index)

    try {
      await lstat(sourcePath)
    } catch {
      issues.push({
        kind: 'conflict',
        reason: `Skill path does not exist: ${sourcePath}.`,
        resourceKind: 'skills',
        resourceName: skillPath
      })
      continue
    }

    if (ownedTargets.has(targetPath)) {
      continue
    }

    if (await pathExists(targetPath)) {
      issues.push({
        kind: 'conflict',
        reason: `Skill install target already exists: ${targetPath}.`,
        resourceKind: 'skills',
        resourceName: skillPath
      })
    }
  }

  return issues
}

async function ownedSkillConflicts(owned: InstalledExtension): Promise<ExtensionIssue[]> {
  const issues: ExtensionIssue[] = []

  for (const skill of owned.skills) {
    const proof = await skillOwnershipProofMatches(skill)
    if (proof === 'missing' || proof === 'matches') {
      continue
    }

    issues.push({
      kind: 'conflict',
      reason: `Skill install target is no longer owned by this extension: ${skill.targetPath}.`,
      resourceKind: 'skills',
      resourceName: skill.targetPath
    })
  }

  return issues
}

async function skillOwnershipProofMatches(skill: InstalledSkill): Promise<'matches' | 'missing' | 'mismatch'> {
  const linkPath = skill.kind === 'file-symlink-directory' ? join(skill.targetPath, 'SKILL.md') : skill.targetPath

  let linkStat: Awaited<ReturnType<typeof lstat>>
  try {
    linkStat = await lstat(linkPath)
  } catch (error) {
    if (isNotFound(error)) {
      return 'missing'
    }
    throw error
  }

  if (!linkStat.isSymbolicLink()) {
    return 'mismatch'
  }

  return (await readlink(linkPath)) === skill.sourcePath ? 'matches' : 'mismatch'
}

async function mcpConflicts(
  config: ExtensionFacetConfig,
  extension: HarnessExtension,
  owned: InstalledExtension | undefined
): Promise<ExtensionIssue[]> {
  if (!config.mcp) {
    return []
  }

  const ownedNames = new Set((owned?.mcpServers ?? []).map(server => server.name))
  const issues: ExtensionIssue[] = []

  for (const name of Object.keys(extension.resources.mcpServers ?? {})) {
    if (ownedNames.has(name)) {
      continue
    }

    if (await config.mcp.currentFingerprint(name)) {
      issues.push(mcpConflict(name, config.mcp.configFile))
    }
  }

  return issues
}

async function ownedMcpConflicts(
  config: ExtensionFacetConfig,
  owned: InstalledExtension,
  extension?: HarnessExtension
): Promise<ExtensionIssue[]> {
  if (!config.mcp) {
    return []
  }

  const issues: ExtensionIssue[] = []

  for (const server of owned.mcpServers) {
    const current = await config.mcp.currentFingerprint(server.name)
    if (!current || current === server.fingerprint) {
      continue
    }

    if (
      extension &&
      (await config.mcp.canReclaimOnInstall?.({
        extension,
        name: server.name
      }))
    ) {
      continue
    }

    issues.push({
      kind: 'conflict',
      reason: `MCP server ${server.name} is no longer owned by this extension.`,
      resourceKind: 'mcpServers',
      resourceName: server.name
    })
  }

  return issues
}

function mcpConflict(name: string, configFile: string): ExtensionIssue {
  return {
    kind: 'conflict',
    reason: `MCP server ${name} already exists in ${configFile}.`,
    resourceKind: 'mcpServers',
    resourceName: name
  }
}

async function hookConflicts(
  config: ExtensionFacetConfig,
  extension: HarnessExtension,
  owned: InstalledExtension | undefined
): Promise<ExtensionIssue[]> {
  if (!config.hooks) {
    return []
  }

  const ownedKeys = new Set((owned?.hooks ?? []).map(hook => hookKey(hook)))
  const hooks = (extension.resources.hooks ?? []).filter(hook => {
    return config.hooks?.events.includes(hook.event) && !ownedKeys.has(hookKey(hook))
  })

  return config.hooks.conflicts({ extensionId: extension.id, hooks })
}

async function ownedHookConflicts(config: ExtensionFacetConfig, owned: InstalledExtension): Promise<ExtensionIssue[]> {
  if (!config.hooks) {
    return []
  }

  const issues: ExtensionIssue[] = []

  for (const hook of owned.hooks) {
    const current = await config.hooks.currentFingerprint(hook)
    if (!current || current === hook.fingerprint) {
      continue
    }

    issues.push({
      kind: 'conflict',
      reason: `Hook ${hook.event}/${hook.command} is no longer owned by this extension.`,
      resourceKind: 'hooks',
      resourceName: hook.targetPath ?? hook.command
    })
  }

  return issues
}

async function installSkills(
  config: ExtensionFacetConfig,
  extension: HarnessExtension,
  installed: InstalledExtension
): Promise<void> {
  if (!config.skillsDirectory) {
    return
  }

  for (const [index, skillPath] of (extension.resources.skills ?? []).entries()) {
    const sourcePath = resolveExtensionPath(config, skillPath)
    const sourceStat = await stat(sourcePath)
    const targetPath = skillTargetPath(config.skillsDirectory, extension.id, skillPath, index)

    await mkdir(dirname(targetPath), { recursive: true })
    if (sourceStat.isDirectory()) {
      await symlink(sourcePath, targetPath)
      installed.skills.push({ kind: 'directory-symlink', sourcePath, targetPath })
    } else {
      await mkdir(targetPath, { recursive: true })
      await symlink(sourcePath, join(targetPath, 'SKILL.md'))
      installed.skills.push({ kind: 'file-symlink-directory', sourcePath, targetPath })
    }
  }
}

async function installMcpServers(
  config: ExtensionFacetConfig,
  extension: HarnessExtension,
  installed: InstalledExtension
): Promise<void> {
  if (!config.mcp) {
    return
  }

  for (const [name, server] of Object.entries(extension.resources.mcpServers ?? {})) {
    installed.mcpServers.push(await config.mcp.install({ extensionId: extension.id, name, server }))
  }
}

async function installHooks(
  config: ExtensionFacetConfig,
  extension: HarnessExtension,
  installed: InstalledExtension
): Promise<void> {
  if (!config.hooks) {
    return
  }

  const hooks = (extension.resources.hooks ?? []).filter(hook => config.hooks?.events.includes(hook.event))
  if (hooks.length === 0) {
    return
  }

  installed.hooks.push(...(await config.hooks.install({ extensionId: extension.id, hooks })))
}

async function uninstallOwned(config: ExtensionFacetConfig, owned: InstalledExtension | undefined): Promise<void> {
  if (!owned) {
    return
  }

  await uninstallSkills(owned)
  await uninstallMcpServers(config, owned)
  await uninstallHooks(config, owned)
}

async function restoreOwned(
  config: ExtensionFacetConfig,
  extensionId: string,
  owned: InstalledExtension | undefined
): Promise<void> {
  if (!owned) {
    return
  }

  await restoreSkills(owned)
  await restoreMcpServers(config, extensionId, owned)
  await restoreHooks(config, owned)
}

async function restoreSkills(owned: InstalledExtension): Promise<void> {
  for (const skill of owned.skills) {
    if ((await skillOwnershipProofMatches(skill)) !== 'missing') {
      continue
    }

    if (await pathExists(skill.targetPath)) {
      continue
    }

    await mkdir(dirname(skill.targetPath), { recursive: true })
    if (skill.kind === 'directory-symlink') {
      await symlink(skill.sourcePath, skill.targetPath)
      continue
    }

    await mkdir(skill.targetPath, { recursive: true })
    await symlink(skill.sourcePath, join(skill.targetPath, 'SKILL.md'))
  }
}

async function restoreMcpServers(
  config: ExtensionFacetConfig,
  extensionId: string,
  owned: InstalledExtension
): Promise<void> {
  if (!config.mcp) {
    return
  }

  for (const server of owned.mcpServers) {
    if (!server.server || (await config.mcp.currentFingerprint(server.name))) {
      continue
    }

    await config.mcp.install({ extensionId, name: server.name, server: server.server })
  }
}

async function restoreHooks(config: ExtensionFacetConfig, owned: InstalledExtension): Promise<void> {
  if (!config.hooks || owned.hooks.length === 0) {
    return
  }

  await config.hooks.restore(owned.hooks)
}

async function uninstallSkills(owned: InstalledExtension): Promise<void> {
  for (const skill of owned.skills) {
    const proof = await skillOwnershipProofMatches(skill)
    if (proof !== 'matches') {
      continue
    }

    if (skill.kind === 'directory-symlink') {
      await rm(skill.targetPath, { force: true })
      continue
    }

    await rm(join(skill.targetPath, 'SKILL.md'), { force: true })
    try {
      await rmdir(skill.targetPath)
    } catch (error) {
      if (!isNotFound(error) && !isNotEmpty(error)) {
        throw error
      }
    }
  }
}

async function uninstallMcpServers(config: ExtensionFacetConfig, owned: InstalledExtension): Promise<void> {
  if (!config.mcp) {
    return
  }

  for (const server of owned.mcpServers) {
    const current = await config.mcp.currentFingerprint(server.name)
    if (!current) {
      continue
    }

    await config.mcp.remove(server.name)
  }
}

async function uninstallHooks(config: ExtensionFacetConfig, owned: InstalledExtension): Promise<void> {
  if (!config.hooks || owned.hooks.length === 0) {
    return
  }

  await config.hooks.uninstall(owned.hooks)
}

export function createJsonMcpDriver(configFile: string): McpExtensionDriver {
  return {
    configFile,
    async currentFingerprint(name: string) {
      const mcpConfig = await readJsonFile(configFile)
      const server = objectValue(mcpConfig.mcpServers)?.[name]
      if (server === undefined) {
        return undefined
      }

      return jsonFingerprint(server)
    },
    async install({ name, server }) {
      const config = await readJsonFile(configFile)
      const mcpServers = ensureObject(config, 'mcpServers')
      const record = mcpServerRecord(server)
      mcpServers[name] = record
      await writeJsonFile(configFile, config)
      return { fingerprint: jsonFingerprint(record), name, server: record }
    },
    async remove(name: string) {
      const config = await readJsonFile(configFile)
      const mcpServers = objectValue(config.mcpServers)
      if (mcpServers) {
        delete mcpServers[name]
      }
      await writeJsonFile(configFile, config)
    }
  }
}

export function createJsonHooksDriver(settingsFile: string, events: readonly string[]): HookExtensionDriver {
  async function currentFingerprint(hook: InstalledHook): Promise<string | undefined> {
    const settings = await readJsonFile(settingsFile)
    const hooks = objectValue(settings.hooks)
    const entries = arrayValue(hooks?.[hook.event]) ?? []
    const exactMatches = entries.filter(entry => jsonFingerprint(entry) === hook.fingerprint)

    if (exactMatches.length === 1) {
      return hook.fingerprint
    }

    if (exactMatches.length > 1 || entries.some(entry => jsonHookCommands(entry).includes(hook.command))) {
      return `${hook.fingerprint}:mismatch`
    }

    return undefined
  }

  return {
    events,
    async conflicts({ hooks }) {
      const settings = await readJsonFile(settingsFile)
      const issues: ExtensionIssue[] = []

      for (const hook of hooks) {
        if (jsonHookCommandExists(settings, hook)) {
          issues.push({
            kind: 'conflict',
            reason: `Hook command already exists for ${hook.event} in ${settingsFile}.`,
            resourceKind: 'hooks',
            resourceName: hook.name
          })
        }
      }

      return issues
    },
    currentFingerprint,
    async install({ hooks }) {
      const settings = await readJsonFile(settingsFile)
      const nativeHooks = ensureObject(settings, 'hooks')
      const installed: InstalledHook[] = []

      for (const hook of hooks) {
        const eventHooks = ensureArray(nativeHooks, hook.event)
        const entry = {
          hooks: [{ command: hook.command, type: 'command' }]
        }
        eventHooks.push(entry)
        installed.push({
          command: hook.command,
          event: hook.event,
          fingerprint: jsonFingerprint(entry),
          name: hook.name
        })
      }

      await writeJsonFile(settingsFile, settings)
      return installed
    },
    async restore(hooks: InstalledHook[]) {
      const settings = await readJsonFile(settingsFile)
      const nativeHooks = ensureObject(settings, 'hooks')

      for (const hook of hooks) {
        if (await currentFingerprint(hook)) {
          continue
        }

        ensureArray(nativeHooks, hook.event).push({
          hooks: [{ command: hook.command, type: 'command' }]
        })
      }

      await writeJsonFile(settingsFile, settings)
    },
    async uninstall(hooks: InstalledHook[]) {
      const settings = await readJsonFile(settingsFile)
      const nativeHooks = objectValue(settings.hooks)
      if (!nativeHooks) {
        return
      }

      for (const hook of hooks) {
        const entries = arrayValue(nativeHooks[hook.event])
        if (!entries) {
          continue
        }

        nativeHooks[hook.event] = entries.filter(entry => jsonFingerprint(entry) !== hook.fingerprint)
      }

      await writeJsonFile(settingsFile, settings)
    }
  }
}

export function mcpServerRecord(server: McpServerResource): McpServerResource {
  return {
    args: server.args ?? [],
    command: server.command,
    ...(server.env ? { env: server.env } : {})
  }
}

function jsonHookCommandExists(settings: JsonObject, hook: HookResource): boolean {
  const hooks = objectValue(settings.hooks)
  const eventHooks = arrayValue(hooks?.[hook.event])
  return eventHooks?.some(entry => jsonHookCommands(entry).includes(hook.command)) ?? false
}

function jsonHookCommands(entry: unknown): string[] {
  const group = objectValue(entry)
  const commands = arrayValue(group?.hooks) ?? []
  return commands.flatMap(candidate => {
    const hook = objectValue(candidate)
    return hook?.type === 'command' && typeof hook.command === 'string' ? [hook.command] : []
  })
}

async function readState(config: ExtensionFacetConfig): Promise<ExtensionState> {
  const state = await readJsonFile(join(config.configDirectory, STATE_FILE))
  return { extensions: (objectValue(state.extensions) as Record<string, InstalledExtension> | undefined) ?? {} }
}

async function writeState(config: ExtensionFacetConfig, state: ExtensionState): Promise<void> {
  await writeJsonFile(join(config.configDirectory, STATE_FILE), state)
}

function resolveExtensionPath(config: ExtensionFacetConfig, path: string): string {
  return isAbsolute(path) ? path : resolve(config.context?.cwd ?? process.cwd(), path)
}

function skillTargetPath(skillsDirectory: string, extensionId: string, skillPath: string, index: number): string {
  return join(skillsDirectory, `${safeName(extensionId)}__${index}_${safeName(skillBaseName(skillPath))}`)
}

function skillBaseName(path: string): string {
  const base = basename(path)
  const extension = extname(base)
  return extension ? base.slice(0, -extension.length) : base
}

export function safeName(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9._-]/g, '_')
}

function hookKey(hook: Pick<InstalledHook, 'command' | 'event'>): string {
  return `${hook.event}\u0000${hook.command}`
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

async function readJsonFile(path: string): Promise<JsonObject> {
  try {
    const text = await readFile(path, 'utf8')
    const value = JSON.parse(text) as unknown
    return objectValue(value) ?? {}
  } catch (error) {
    if (isNotFound(error)) {
      return {}
    }
    throw error
  }
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFileAtomically(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function writeFileAtomically(path: string, text: string): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporaryPath, text)
  try {
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

async function withConfigLock<T>(config: ExtensionFacetConfig, operation: () => Promise<T>): Promise<T> {
  await mkdir(config.configDirectory, { recursive: true })
  const lockPath = join(config.configDirectory, '.harness-extensions.lock')
  const handle = await acquireLock(lockPath)

  try {
    return await operation()
  } finally {
    await handle.close()
    await rm(lockPath, { force: true })
  }
}

async function acquireLock(path: string): Promise<Awaited<ReturnType<typeof open>>> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 5_000) {
    try {
      return await open(path, 'wx')
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error
      }
      await Bun.sleep(50)
    }
  }

  throw new Error(`Timed out waiting for extension config lock: ${path}`)
}

function ensureObject(parent: JsonObject, key: string): JsonObject {
  const current = objectValue(parent[key])
  if (current) {
    return current
  }

  const next: JsonObject = {}
  parent[key] = next
  return next
}

function ensureArray(parent: JsonObject, key: string): unknown[] {
  const current = arrayValue(parent[key])
  if (current) {
    return current
  }

  const next: unknown[] = []
  parent[key] = next
  return next
}

function objectValue(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

export function jsonFingerprint(value: unknown): string {
  return textFingerprint(stableJson(value))
}

function textFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function readJsonFileFingerprint(path: string): Promise<string | undefined> {
  try {
    return jsonFingerprint(await readJsonFile(path))
  } catch (error) {
    if (isNotFound(error)) {
      return undefined
    }
    throw error
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isNotEmpty(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOTEMPTY'
}
