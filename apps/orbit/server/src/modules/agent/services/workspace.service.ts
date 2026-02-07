import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Base path for orbit config. Override with ORBIT_CONFIG_PATH env var for testing. */
const ORBIT_CONFIG_PATH = process.env.ORBIT_CONFIG_PATH || join(homedir(), '.config', 'orbit')
const AGENTS_PATH = join(ORBIT_CONFIG_PATH, 'agents')
const TEMPLATES_PATH = join(import.meta.dir, '..', '..', '..', '..', 'templates')

export function getOrbitBasePath(): string {
  return ORBIT_CONFIG_PATH
}

export function getAgentsPath(): string {
  return AGENTS_PATH
}

export function getAgentWorkspacePath(agentName: string): string {
  return join(AGENTS_PATH, agentName)
}

export function getAgentWorkingDir(agentName: string): string {
  return join(AGENTS_PATH, agentName, 'workspace')
}

export async function ensureOrbitDirs(): Promise<void> {
  await mkdir(ORBIT_CONFIG_PATH, { recursive: true })
  await mkdir(AGENTS_PATH, { recursive: true })
  await mkdir(join(ORBIT_CONFIG_PATH, 'data'), { recursive: true })
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
  const templateFiles = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'HEARTBEAT.md', 'BOOTSTRAP.md', 'TOOLS.md']

  for (const file of templateFiles) {
    const srcPath = join(TEMPLATES_PATH, file)
    const destPath = join(workspacePath, file)

    if (existsSync(srcPath)) {
      await copyFile(srcPath, destPath)
    }
  }

  // Customize IDENTITY.md with agent info
  const identityPath = join(workspacePath, 'IDENTITY.md')
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
  await writeFile(join(workspacePath, 'MEMORY.md'), '# Long-term Memory\n\n(No entries yet)\n')

  return workspacePath
}

export async function agentWorkspaceExists(agentName: string): Promise<boolean> {
  return existsSync(getAgentWorkspacePath(agentName))
}

export async function listAgentWorkspaces(): Promise<string[]> {
  if (!existsSync(AGENTS_PATH)) {
    return []
  }

  const entries = await readdir(AGENTS_PATH, { withFileTypes: true })
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
