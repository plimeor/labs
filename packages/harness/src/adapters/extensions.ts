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
  mcp?: CodexMcpConfig | ClaudeMcpConfig | KiroMcpConfig
  hooks?: JsonHooksConfig | KiroHookFilesConfig
}

type CodexMcpConfig = {
  kind: 'codex-toml'
  configFile: string
}

type ClaudeMcpConfig = {
  kind: 'claude-json'
  configFile: string
}

type KiroMcpConfig = {
  configFile: string
  kind: 'kiro-cli'
}

type JsonHooksConfig = {
  kind: 'json-hooks'
  settingsFile: string
  events: readonly string[]
}

type KiroHookFilesConfig = {
  kind: 'kiro-hook-files'
  hooksDirectory: string
  events: readonly string[]
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

type InstalledMcpServer = {
  fingerprint: string
  name: string
  server?: McpServerResource
}

type InstalledHook = {
  command: string
  event: string
  fingerprint: string
  name?: string
  targetPath?: string
}

type JsonObject = Record<string, unknown>

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

  issues.push(...(await ownershipConflicts(config, owned)))
  issues.push(...unsupportedIssues(config, extension))
  issues.push(...unsupportedHookEvents(config, extension))
  issues.push(...(await skillConflicts(config, extension, owned)))
  issues.push(...(await mcpConflicts(config, extension, owned)))
  issues.push(...(await hookConflicts(config, extension, owned)))

  return issues
}

async function ownershipConflicts(
  config: ExtensionFacetConfig,
  owned: InstalledExtension | undefined
): Promise<ExtensionIssue[]> {
  if (!owned) {
    return []
  }

  return [
    ...(await ownedSkillConflicts(owned)),
    ...(await ownedMcpConflicts(config, owned)),
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

    if (config.mcp.kind === 'kiro-cli' && (await jsonMcpServerExists(config.mcp.configFile, name))) {
      issues.push(mcpConflict(name, config.mcp.configFile))
    }

    if (config.mcp.kind === 'claude-json' && (await claudeMcpServerExists(config.mcp.configFile, name))) {
      issues.push(mcpConflict(name, config.mcp.configFile))
    }

    if (config.mcp.kind === 'codex-toml' && (await codexMcpServerExists(config.mcp.configFile, name))) {
      issues.push(mcpConflict(name, config.mcp.configFile))
    }
  }

  return issues
}

async function ownedMcpConflicts(config: ExtensionFacetConfig, owned: InstalledExtension): Promise<ExtensionIssue[]> {
  if (!config.mcp) {
    return []
  }

  const issues: ExtensionIssue[] = []

  for (const server of owned.mcpServers) {
    const current = await currentMcpFingerprint(config, server.name)
    if (!current || current === server.fingerprint) {
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
  const issues: ExtensionIssue[] = []

  for (const hook of extension.resources.hooks ?? []) {
    if (!config.hooks.events.includes(hook.event) || ownedKeys.has(hookKey(hook))) {
      continue
    }

    if (config.hooks.kind === 'kiro-hook-files') {
      const targetPath = kiroHookTargetPath(config.hooks.hooksDirectory, extension.id, hook)
      if (await pathExists(targetPath)) {
        issues.push({
          kind: 'conflict',
          reason: `Hook install target already exists: ${targetPath}.`,
          resourceKind: 'hooks',
          resourceName: hook.name
        })
      }
      continue
    }

    const settings = await readJsonFile(config.hooks.settingsFile)
    if (jsonHookCommandExists(settings, hook)) {
      issues.push({
        kind: 'conflict',
        reason: `Hook command already exists for ${hook.event} in ${config.hooks.settingsFile}.`,
        resourceKind: 'hooks',
        resourceName: hook.name
      })
    }
  }

  return issues
}

async function ownedHookConflicts(config: ExtensionFacetConfig, owned: InstalledExtension): Promise<ExtensionIssue[]> {
  if (!config.hooks) {
    return []
  }

  const issues: ExtensionIssue[] = []

  for (const hook of owned.hooks) {
    const current = await currentHookFingerprint(config, hook)
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
    if (config.mcp.kind === 'kiro-cli') {
      installed.mcpServers.push(await installKiroMcpServer(config, name, server))
    } else if (config.mcp.kind === 'claude-json') {
      installed.mcpServers.push(await installClaudeMcpServer(config.mcp.configFile, name, server))
    } else {
      installed.mcpServers.push(await installCodexMcpServer(config.mcp.configFile, extension.id, name, server))
    }
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

  if (config.hooks.kind === 'kiro-hook-files') {
    await installKiroHooks(config, extension, installed)
    return
  }

  const settings = await readJsonFile(config.hooks.settingsFile)
  const hooks = ensureObject(settings, 'hooks')

  for (const hook of extension.resources.hooks ?? []) {
    if (!config.hooks.events.includes(hook.event)) {
      continue
    }

    const eventHooks = ensureArray(hooks, hook.event)
    const entry = {
      hooks: [{ command: hook.command, type: 'command' }]
    }
    eventHooks.push(entry)
    installed.hooks.push({
      command: hook.command,
      event: hook.event,
      fingerprint: jsonFingerprint(entry),
      name: hook.name
    })
  }

  await writeJsonFile(config.hooks.settingsFile, settings)
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
    if (!server.server || (await currentMcpFingerprint(config, server.name))) {
      continue
    }

    if (config.mcp.kind === 'kiro-cli') {
      await installKiroMcpServer(config, server.name, server.server)
    } else if (config.mcp.kind === 'claude-json') {
      await installClaudeMcpServer(config.mcp.configFile, server.name, server.server)
    } else {
      await installCodexMcpServer(config.mcp.configFile, extensionId, server.name, server.server)
    }
  }
}

async function restoreHooks(config: ExtensionFacetConfig, owned: InstalledExtension): Promise<void> {
  if (!config.hooks) {
    return
  }

  if (config.hooks.kind === 'kiro-hook-files') {
    for (const hook of owned.hooks) {
      if (!hook.targetPath || !hook.name || (await pathExists(hook.targetPath))) {
        continue
      }

      await writeJsonFile(
        hook.targetPath,
        kiroHookConfig({ command: hook.command, event: hook.event, name: hook.name })
      )
    }
    return
  }

  const settings = await readJsonFile(config.hooks.settingsFile)
  const hooks = ensureObject(settings, 'hooks')

  for (const hook of owned.hooks) {
    if (await currentHookFingerprint(config, hook)) {
      continue
    }

    ensureArray(hooks, hook.event).push({
      hooks: [{ command: hook.command, type: 'command' }]
    })
  }

  await writeJsonFile(config.hooks.settingsFile, settings)
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
    const current = await currentMcpFingerprint(config, server.name)
    if (!current) {
      continue
    }

    if (config.mcp.kind === 'kiro-cli') {
      await removeKiroMcpServer(config, server.name)
    } else if (config.mcp.kind === 'claude-json') {
      await removeClaudeMcpServer(config.mcp.configFile, server.name)
    } else {
      await removeCodexMcpServer(config.mcp.configFile, server.name)
    }
  }
}

async function uninstallHooks(config: ExtensionFacetConfig, owned: InstalledExtension): Promise<void> {
  if (!config.hooks || owned.hooks.length === 0) {
    return
  }

  if (config.hooks.kind === 'kiro-hook-files') {
    await uninstallKiroHooks(owned)
    return
  }

  const settings = await readJsonFile(config.hooks.settingsFile)
  const hooks = objectValue(settings.hooks)
  if (!hooks) {
    return
  }

  for (const hook of owned.hooks) {
    const entries = arrayValue(hooks[hook.event])
    if (!entries) {
      continue
    }

    hooks[hook.event] = entries.filter(entry => jsonFingerprint(entry) !== hook.fingerprint)
  }

  await writeJsonFile(config.hooks.settingsFile, settings)
}

async function installKiroHooks(
  config: ExtensionFacetConfig,
  extension: HarnessExtension,
  installed: InstalledExtension
): Promise<void> {
  if (config.hooks?.kind !== 'kiro-hook-files') {
    return
  }

  for (const hook of extension.resources.hooks ?? []) {
    if (!config.hooks.events.includes(hook.event)) {
      continue
    }

    const targetPath = kiroHookTargetPath(config.hooks.hooksDirectory, extension.id, hook)
    const hookConfig = kiroHookConfig(hook)
    await writeJsonFile(targetPath, hookConfig)
    installed.hooks.push({
      command: hook.command,
      event: hook.event,
      fingerprint: jsonFingerprint(hookConfig),
      name: hook.name,
      targetPath
    })
  }
}

function kiroHookConfig(hook: HookResource): JsonObject {
  return {
    version: 'v1',
    hooks: [
      {
        action: { command: hook.command, type: 'command' },
        enabled: true,
        name: hook.name,
        trigger: hook.event
      }
    ]
  }
}

async function uninstallKiroHooks(owned: InstalledExtension): Promise<void> {
  for (const hook of owned.hooks) {
    if (hook.targetPath) {
      const current = await readJsonFileFingerprint(hook.targetPath)
      if (current !== hook.fingerprint) {
        continue
      }
      await rm(hook.targetPath, { force: true })
    }
  }
}

async function installClaudeMcpServer(
  configFile: string,
  name: string,
  server: McpServerResource
): Promise<InstalledMcpServer> {
  const config = await readJsonFile(configFile)
  const mcpServers = ensureObject(config, 'mcpServers')
  mcpServers[name] = {
    args: server.args ?? [],
    command: server.command,
    ...(server.env ? { env: server.env } : {})
  }
  await writeJsonFile(configFile, config)
  return { fingerprint: jsonFingerprint(mcpServers[name]), name, server: mcpServerRecord(server) }
}

function mcpServerRecord(server: McpServerResource): McpServerResource {
  return {
    args: server.args ?? [],
    command: server.command,
    ...(server.env ? { env: server.env } : {})
  }
}

async function removeClaudeMcpServer(configFile: string, name: string): Promise<void> {
  const config = await readJsonFile(configFile)
  const mcpServers = objectValue(config.mcpServers)
  if (mcpServers) {
    delete mcpServers[name]
  }
  await writeJsonFile(configFile, config)
}

async function claudeMcpServerExists(configFile: string, name: string): Promise<boolean> {
  return jsonMcpServerExists(configFile, name)
}

async function jsonMcpServerExists(configFile: string, name: string): Promise<boolean> {
  const config = await readJsonFile(configFile)
  return objectValue(config.mcpServers)?.[name] !== undefined
}

async function currentMcpFingerprint(config: ExtensionFacetConfig, name: string): Promise<string | undefined> {
  if (!config.mcp) {
    return undefined
  }

  if (config.mcp.kind === 'codex-toml') {
    const block = codexMcpServerBlock(await readTextFile(config.mcp.configFile), name)
    return block ? textFingerprint(block) : undefined
  }

  const mcpConfig = await readJsonFile(config.mcp.configFile)
  const server = objectValue(mcpConfig.mcpServers)?.[name]
  return server === undefined ? undefined : jsonFingerprint(server)
}

async function installKiroMcpServer(
  config: ExtensionFacetConfig,
  name: string,
  server: McpServerResource
): Promise<InstalledMcpServer> {
  const args = ['mcp', 'add', '--scope', 'global', '--name', name, '--command', server.command]

  if (server.args && server.args.length > 0) {
    args.push('--args', JSON.stringify(server.args))
  }

  for (const [key, value] of Object.entries(server.env ?? {})) {
    args.push('--env', `${key}=${value}`)
  }

  await runKiroCommand(config, args)

  const fingerprint = await currentMcpFingerprint(config, name)
  if (!fingerprint) {
    await removeKiroMcpServer(config, name)
    throw new Error(`Kiro MCP server ${name} was not written to ${config.mcp?.configFile}.`)
  }

  return { fingerprint, name, server: mcpServerRecord(server) }
}

async function removeKiroMcpServer(config: ExtensionFacetConfig, name: string): Promise<void> {
  await runKiroCommand(config, ['mcp', 'remove', '--scope', 'global', '--name', name])
}

async function installCodexMcpServer(
  configFile: string,
  extensionId: string,
  name: string,
  server: McpServerResource
): Promise<InstalledMcpServer> {
  const current = await readTextFile(configFile)
  const block = codexMcpBlock(extensionId, name, server)
  const next = `${removeCodexMcpServerBlock(current, name).trimEnd()}\n\n${block}\n`
  await writeTextFile(configFile, next)
  return { fingerprint: textFingerprint(block), name, server: mcpServerRecord(server) }
}

async function removeCodexMcpServer(configFile: string, name: string): Promise<void> {
  const current = await readTextFile(configFile)
  await writeTextFile(configFile, `${removeCodexMcpServerBlock(current, name).trimEnd()}\n`)
}

async function codexMcpServerExists(configFile: string, name: string): Promise<boolean> {
  const config = await readTextFile(configFile)
  return codexMcpHeaderPattern(name).test(config)
}

function codexMcpBlock(extensionId: string, name: string, server: McpServerResource): string {
  const lines = [
    codexBeginMarker(name),
    `[mcp_servers.${tomlKey(name)}]`,
    `command = ${tomlString(server.command)}`,
    `args = ${tomlArray(server.args ?? [])}`
  ]

  const env = server.env ?? {}
  if (Object.keys(env).length > 0) {
    lines.push('', `[mcp_servers.${tomlKey(name)}.env]`)
    for (const [key, value] of Object.entries(env)) {
      lines.push(`${tomlKey(key)} = ${tomlString(value)}`)
    }
  }

  lines.push(`# @plimeor/harness extension = ${extensionId}`, codexEndMarker(name))
  return lines.join('\n')
}

function removeCodexMcpServerBlock(config: string, name: string): string {
  const begin = escapeRegExp(codexBeginMarker(name))
  const end = escapeRegExp(codexEndMarker(name))
  return config.replace(new RegExp(`\\n?${begin}[\\s\\S]*?${end}\\n?`, 'g'), '\n')
}

function codexMcpServerBlock(config: string, name: string): string | undefined {
  const begin = escapeRegExp(codexBeginMarker(name))
  const end = escapeRegExp(codexEndMarker(name))
  return config.match(new RegExp(`${begin}[\\s\\S]*?${end}`))?.[0]
}

function codexMcpHeaderPattern(name: string): RegExp {
  const unquoted = escapeRegExp(`[mcp_servers.${name}]`)
  const quoted = escapeRegExp(`[mcp_servers.${tomlKey(name)}]`)
  return new RegExp(`(^|\\n)(${unquoted}|${quoted})(\\n|$)`)
}

function codexBeginMarker(name: string): string {
  return `# @plimeor/harness begin mcpServers ${name}`
}

function codexEndMarker(name: string): string {
  return `# @plimeor/harness end mcpServers ${name}`
}

function jsonHookCommandExists(settings: JsonObject, hook: HookResource): boolean {
  const hooks = objectValue(settings.hooks)
  const eventHooks = arrayValue(hooks?.[hook.event])
  return eventHooks?.some(entry => claudeHookCommands(entry).includes(hook.command)) ?? false
}

function claudeHookCommands(entry: unknown): string[] {
  const group = objectValue(entry)
  const commands = arrayValue(group?.hooks) ?? []
  return commands.flatMap(candidate => {
    const hook = objectValue(candidate)
    return hook?.type === 'command' && typeof hook.command === 'string' ? [hook.command] : []
  })
}

async function currentHookFingerprint(config: ExtensionFacetConfig, hook: InstalledHook): Promise<string | undefined> {
  if (config.hooks?.kind === 'kiro-hook-files') {
    return hook.targetPath ? readJsonFileFingerprint(hook.targetPath) : undefined
  }

  if (!config.hooks) {
    return undefined
  }

  const settings = await readJsonFile(config.hooks.settingsFile)
  const hooks = objectValue(settings.hooks)
  const entries = arrayValue(hooks?.[hook.event]) ?? []
  const exactMatches = entries.filter(entry => jsonFingerprint(entry) === hook.fingerprint)

  if (exactMatches.length === 1) {
    return hook.fingerprint
  }

  if (exactMatches.length > 1 || entries.some(entry => claudeHookCommands(entry).includes(hook.command))) {
    return `${hook.fingerprint}:mismatch`
  }

  return undefined
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

function kiroHookTargetPath(hooksDirectory: string, extensionId: string, hook: HookResource): string {
  return join(hooksDirectory, `${safeName(extensionId)}__${safeName(hook.name)}.json`)
}

function skillBaseName(path: string): string {
  const base = basename(path)
  const extension = extname(base)
  return extension ? base.slice(0, -extension.length) : base
}

function safeName(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9._-]/g, '_')
}

function hookKey(hook: Pick<InstalledHook, 'command' | 'event'>): string {
  return `${hook.event}\u0000${hook.command}`
}

async function pathExists(path: string): Promise<boolean> {
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

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFileAtomically(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) {
      return ''
    }
    throw error
  }
}

async function writeTextFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFileAtomically(path, text)
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

async function runKiroCommand(
  config: ExtensionFacetConfig,
  args: string[]
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const subprocess = Bun.spawn({
    cmd: ['kiro-cli', ...args],
    cwd: config.context?.cwd ?? process.cwd(),
    env: Object.fromEntries(
      Object.entries({
        ...process.env,
        ...(config.context?.home ? { KIRO_HOME: config.configDirectory } : {}),
        ...(config.context?.env ?? {})
      }).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string'
      })
    ),
    stderr: 'pipe',
    stdout: 'pipe'
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text()
  ])

  if (exitCode !== 0) {
    throw new Error(`kiro-cli ${args.join(' ')} failed: ${stderr || stdout}`)
  }

  return { exitCode, stderr, stdout }
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

function tomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value)
}

function tomlArray(values: string[]): string {
  return `[${values.map(tomlString).join(', ')}]`
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function jsonFingerprint(value: unknown): string {
  return textFingerprint(stableJson(value))
}

function textFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function readJsonFileFingerprint(path: string): Promise<string | undefined> {
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

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
