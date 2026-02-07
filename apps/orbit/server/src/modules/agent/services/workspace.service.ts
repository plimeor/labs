import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export enum WorkspaceFile {
  AGENTS = 'AGENTS.md',
  SOUL = 'SOUL.md',
  IDENTITY = 'IDENTITY.md',
  USER = 'USER.md',
  HEARTBEAT = 'HEARTBEAT.md',
  BOOTSTRAP = 'BOOTSTRAP.md',
  TOOLS = 'TOOLS.md',
  MEMORY = 'MEMORY.md'
}

/** Base path for orbit config. Override with ORBIT_CONFIG_PATH env var for testing. */
const ORBIT_CONFIG_PATH = process.env.ORBIT_CONFIG_PATH || join(homedir(), '.config', 'orbit')
const ORBIT_AGENTS_PATH = join(ORBIT_CONFIG_PATH, 'agents')
const ORBIT_TEMPLATES_PATH = join(import.meta.dir, '..', '..', '..', '..', 'templates')

export function getOrbitBasePath(): string {
  return ORBIT_CONFIG_PATH
}

export function getAgentsPath(): string {
  return ORBIT_AGENTS_PATH
}

export function getAgentWorkspacePath(agentName: string): string {
  return join(ORBIT_AGENTS_PATH, agentName)
}

export function getAgentWorkingDir(agentName: string): string {
  return join(ORBIT_AGENTS_PATH, agentName, 'workspace')
}

export async function ensureOrbitDirs(): Promise<void> {
  await mkdir(ORBIT_CONFIG_PATH, { recursive: true })
  await mkdir(ORBIT_AGENTS_PATH, { recursive: true })
}

export async function createAgentWorkspace(
  agentName: string,
  displayName?: string,
  description?: string
): Promise<string> {
  const workspacePath = getAgentWorkspacePath(agentName)

  if (existsSync(workspacePath)) {
    throw new Error(`Agent workspace already exists: ${agentName}`)
  }

  // Create directory structure
  await mkdir(workspacePath, { recursive: true })
  await mkdir(join(workspacePath, 'memory'), { recursive: true })
  await mkdir(join(workspacePath, 'workspace'), { recursive: true })
  await mkdir(join(workspacePath, 'sessions'), { recursive: true })
  await mkdir(join(workspacePath, 'tasks'), { recursive: true })
  await mkdir(join(workspacePath, 'tasks', 'runs'), { recursive: true })
  await mkdir(join(workspacePath, 'inbox', 'pending'), { recursive: true })
  await mkdir(join(workspacePath, 'inbox', 'archive'), { recursive: true })
  await mkdir(join(workspacePath, 'sources'), { recursive: true })
  await mkdir(join(workspacePath, '.claude', 'skills'), { recursive: true })

  // Copy template files
  const templateFiles = [
    WorkspaceFile.AGENTS,
    WorkspaceFile.SOUL,
    WorkspaceFile.IDENTITY,
    WorkspaceFile.USER,
    WorkspaceFile.HEARTBEAT,
    WorkspaceFile.BOOTSTRAP,
    WorkspaceFile.TOOLS
  ]

  for (const file of templateFiles) {
    const srcPath = join(ORBIT_TEMPLATES_PATH, file)
    const destPath = join(workspacePath, file)

    if (existsSync(srcPath)) {
      await copyFile(srcPath, destPath)
    }
  }

  // Customize IDENTITY.md with agent info
  const identityPath = join(workspacePath, WorkspaceFile.IDENTITY)
  if (existsSync(identityPath)) {
    const { readFile } = await import('node:fs/promises')
    let content = await readFile(identityPath, 'utf-8')
    content = content
      .replace('{{AGENT_NAME}}', displayName || agentName)
      .replace('{{CREATED_DATE}}', new Date().toISOString().split('T')[0]!)
      .replace('{{AGENT_DESCRIPTION}}', description || 'A helpful AI assistant')
    await writeFile(identityPath, content)
  }

  // Create empty long-term memory
  await writeFile(join(workspacePath, WorkspaceFile.MEMORY), '# Long-term Memory\n\n(No entries yet)\n')

  return workspacePath
}

export async function agentWorkspaceExists(agentName: string): Promise<boolean> {
  return existsSync(getAgentWorkspacePath(agentName))
}

export async function listAgentWorkspaces(): Promise<string[]> {
  if (!existsSync(ORBIT_AGENTS_PATH)) {
    return []
  }

  const entries = await readdir(ORBIT_AGENTS_PATH, { withFileTypes: true })
  return entries.filter(e => e.isDirectory()).map(e => e.name)
}

export async function deleteAgentWorkspace(agentName: string): Promise<void> {
  const workspacePath = getAgentWorkspacePath(agentName)

  if (!existsSync(workspacePath)) {
    throw new Error(`Agent workspace not found: ${agentName}`)
  }

  const { rm } = await import('node:fs/promises')
  await rm(workspacePath, { recursive: true })
}

// --- Git Worktree Operations ---

const WORKTREES_DIR = '.worktrees'

export function getWorktreesDir(agentName: string, basePath?: string): string {
  const base = basePath ?? ORBIT_CONFIG_PATH
  return join(base, 'agents', agentName, 'workspace', WORKTREES_DIR)
}

export function getWorktreePath(agentName: string, taskId: string, basePath?: string): string {
  return join(getWorktreesDir(agentName, basePath), taskId)
}

export async function createWorktree(
  agentName: string,
  taskId: string,
  branch?: string,
  basePath?: string
): Promise<string> {
  const base = basePath ?? ORBIT_CONFIG_PATH
  const workspaceDir = join(base, 'agents', agentName, 'workspace')
  const worktreePath = getWorktreePath(agentName, taskId, basePath)
  const branchName = branch ?? `orbit/${taskId}`

  await mkdir(getWorktreesDir(agentName, basePath), { recursive: true })

  const proc = Bun.spawn(['git', 'worktree', 'add', '-b', branchName, worktreePath], {
    cwd: workspaceDir,
    stdout: 'pipe',
    stderr: 'pipe'
  })
  await proc.exited
  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`git worktree add failed (exit ${proc.exitCode}): ${stderr}`)
  }

  return worktreePath
}

export async function deleteWorktree(agentName: string, taskId: string, basePath?: string): Promise<void> {
  const base = basePath ?? ORBIT_CONFIG_PATH
  const workspaceDir = join(base, 'agents', agentName, 'workspace')
  const worktreePath = getWorktreePath(agentName, taskId, basePath)

  const proc = Bun.spawn(['git', 'worktree', 'remove', worktreePath, '--force'], {
    cwd: workspaceDir,
    stdout: 'pipe',
    stderr: 'pipe'
  })
  await proc.exited
}

export async function listWorktrees(
  agentName: string,
  basePath?: string
): Promise<Array<{ taskId: string; path: string }>> {
  const worktreesDir = getWorktreesDir(agentName, basePath)
  if (!existsSync(worktreesDir)) return []

  const entries = await readdir(worktreesDir, { withFileTypes: true })
  return entries.filter(e => e.isDirectory()).map(e => ({ taskId: e.name, path: join(worktreesDir, e.name) }))
}
