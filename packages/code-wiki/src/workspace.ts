import { dirname, join, relative, resolve } from 'node:path'

import * as v from 'valibot'

import { Files } from './files.js'
import { inferProjectIdFromRoot, readGitIdentity, requireGitRoot } from './git.js'
import {
  type CodeWikiConfig,
  CodeWikiConfigSchema,
  type EmbeddedProject,
  EmbeddedProjectSchema,
  type ProjectsDocument,
  type RuntimeId,
  RuntimeIdSchema,
  TextSchema,
  type WorkspaceMode
} from './types.js'

export type Workspace = {
  config: CodeWikiConfig
  configPath: string
  root: string
  stateDir: string
}

export function statePath(workspace: Workspace, ...segments: string[]): string {
  return join(workspace.stateDir, ...segments)
}

export async function initSharedWorkspace(cwd: string): Promise<Workspace> {
  const root = await requireGitRoot(resolve(cwd))
  const stateDir = join(root, '.code-wiki')
  const config: CodeWikiConfig = { mode: 'shared', runtime: undefined, schemaVersion: 1 }

  await Files.ensureDir(stateDir)
  await writeConfig(join(stateDir, 'config.json'), config)
  await Files.writeJson(join(stateDir, 'projects.json'), { projects: [], schemaVersion: 1 } satisfies ProjectsDocument)
  await ensureManagedReposGitignore(stateDir)
  await Files.ensureDir(join(stateDir, 'projects'))
  await Files.ensureDir(join(stateDir, 'reports'))

  return { config, configPath: join(stateDir, 'config.json'), root, stateDir }
}

export async function initEmbeddedWorkspace(cwd: string): Promise<Workspace> {
  const root = await requireGitRoot(cwd)
  const stateDir = join(root, '.code-wiki')
  const git = await readGitIdentity(root)
  const projectId = await inferProjectIdFromRoot(root)
  const config: CodeWikiConfig = { mode: 'embedded', runtime: undefined, schemaVersion: 1 }
  const project: EmbeddedProject = {
    displayName: projectId,
    id: projectId,
    managedRepoPath: undefined,
    ref: git.commit,
    repositoryRoot: root,
    repoUrl: git.repoUrl ?? root,
    wikiPath: '.code-wiki/wiki'
  }

  await Files.ensureDir(stateDir)
  await writeConfig(join(stateDir, 'config.json'), config)
  await Files.writeJson(join(stateDir, 'project.json'), project)
  await ensureManagedReposGitignore(stateDir)
  await Files.ensureDir(join(stateDir, 'reports'))
  await Files.ensureDir(join(stateDir, 'wiki'))

  return { config, configPath: join(stateDir, 'config.json'), root, stateDir }
}

export async function resolveWorkspace(cwd = process.cwd()): Promise<Workspace> {
  const configPath = await findConfigPath(resolve(cwd))
  if (!configPath) {
    throw new Error('CodeWiki workspace not found. Run `code-wiki init --shared` or `code-wiki init` first.')
  }

  const config = await readConfig(configPath)
  return {
    config,
    configPath,
    root: dirname(dirname(configPath)),
    stateDir: dirname(configPath)
  }
}

export async function setWorkspaceRuntime(workspace: Workspace, runtime: RuntimeId): Promise<Workspace> {
  const config = { ...workspace.config, runtime }
  await writeConfig(workspace.configPath, config)
  return { ...workspace, config }
}

export async function ensureRuntime(workspace: Workspace): Promise<RuntimeId> {
  if (workspace.config.runtime) {
    return workspace.config.runtime
  }

  throw new Error('No runtime configured. Run `code-wiki runtime set codex` or `code-wiki runtime select` first.')
}

export async function readEmbeddedProject(workspace: Workspace): Promise<EmbeddedProject> {
  assertMode(workspace, 'embedded')
  return Files.readJson(statePath(workspace, 'project.json'), input => v.parse(EmbeddedProjectSchema, input))
}

export function assertMode(workspace: Workspace, mode: WorkspaceMode): void {
  if (workspace.config.mode !== mode) {
    throw new Error(`This command requires ${mode} mode, but this workspace is ${workspace.config.mode} mode.`)
  }
}

export function workspaceRelative(workspace: Workspace, path: string): string {
  return relative(workspace.root, path) || '.'
}

async function findConfigPath(start: string): Promise<string | undefined> {
  let current = start
  while (true) {
    const candidate = join(current, '.code-wiki', 'config.json')
    if (await Files.pathExists(candidate)) {
      return candidate
    }

    const parent = dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

async function readConfig(path: string): Promise<CodeWikiConfig> {
  return Files.readJson(path, input => v.parse(CodeWikiConfigSchema, input))
}

async function writeConfig(path: string, config: CodeWikiConfig): Promise<void> {
  await Files.writeJson(path, config)
}

async function ensureManagedReposGitignore(stateDir: string): Promise<void> {
  await Files.writeText(join(stateDir, '.gitignore'), 'repos/\n')
}

export function requireRuntimeId(input: unknown): RuntimeId {
  return v.parse(RuntimeIdSchema, v.parse(TextSchema, input))
}
