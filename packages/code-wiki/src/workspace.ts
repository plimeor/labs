import { dirname, join, relative, resolve } from 'node:path'

import * as Git from '@plimeor/git-kit'
import * as v from 'valibot'

import { Files } from './files.js'
import { type CodeWikiConfig, CodeWikiConfigSchema, type ProjectsDocument } from './types.js'

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
  const root = (await Git.stat(resolve(cwd))).path
  const stateDir = join(root, '.code-wiki')
  await assertWorkspaceDoesNotExist(stateDir)
  const config: CodeWikiConfig = { schemaVersion: 1 }

  await Files.ensureDir(stateDir)
  await writeConfig(join(stateDir, 'config.json'), config)
  await Files.writeJson(join(stateDir, 'projects.json'), { projects: [], schemaVersion: 1 } satisfies ProjectsDocument)
  await ensureManagedReposGitignore(stateDir)
  await Files.ensureDir(join(stateDir, 'projects'))
  await Files.ensureDir(join(stateDir, 'reports'))

  return { config, configPath: join(stateDir, 'config.json'), root, stateDir }
}

export async function resolveWorkspace(cwd = process.cwd()): Promise<Workspace> {
  const configPath = await findConfigPath(resolve(cwd))
  if (!configPath) {
    throw new Error('CodeWiki workspace not found. Run `code-wiki init` first.')
  }

  const config = await readConfig(configPath)
  return {
    config,
    configPath,
    root: dirname(dirname(configPath)),
    stateDir: dirname(configPath)
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

async function assertWorkspaceDoesNotExist(stateDir: string): Promise<void> {
  if (await Files.pathExists(join(stateDir, 'config.json'))) {
    throw new Error('CodeWiki workspace already exists.')
  }
}

async function ensureManagedReposGitignore(stateDir: string): Promise<void> {
  await Files.writeText(join(stateDir, '.gitignore'), 'repos/\nprojects/\nreports/\n')
}
