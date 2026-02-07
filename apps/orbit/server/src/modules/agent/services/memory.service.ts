import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { format } from 'date-fns'

import { type SessionType } from './context.service'
import { getAgentWorkspacePath, WorkspaceFile } from './workspace.service'

export interface MemoryEntry {
  sessionType: SessionType
  prompt: string
  result: string
  timestamp: Date
}

export async function appendDailyMemory(agentName: string, entry: MemoryEntry): Promise<void> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const memoryDir = join(workspacePath, 'memory')
  const today = format(new Date(), 'yyyy-MM-dd')
  const filePath = join(memoryDir, `${today}.md`)

  // Ensure memory directory exists
  await mkdir(memoryDir, { recursive: true })

  const time = format(entry.timestamp, 'HH:mm')
  const entryText = `
### ${time} - ${entry.sessionType}

**Prompt:** ${entry.prompt.slice(0, 200)}${entry.prompt.length > 200 ? '...' : ''}

**Summary:** ${entry.result.slice(0, 500)}${entry.result.length > 500 ? '...' : ''}

---
`

  if (existsSync(filePath)) {
    await appendFile(filePath, entryText)
  } else {
    const header = `# Daily Memory - ${today}\n\n`
    await writeFile(filePath, header + entryText)
  }
}

export async function readDailyMemory(agentName: string, date: Date): Promise<string | undefined> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const dateStr = format(date, 'yyyy-MM-dd')
  const filePath = join(workspacePath, 'memory', `${dateStr}.md`)

  if (!existsSync(filePath)) {
    return undefined
  }

  return readFile(filePath, 'utf-8')
}

export async function readLongTermMemory(agentName: string): Promise<string | undefined> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const filePath = join(workspacePath, WorkspaceFile.MEMORY)

  if (!existsSync(filePath)) {
    return undefined
  }

  return readFile(filePath, 'utf-8')
}

export async function updateLongTermMemory(agentName: string, content: string): Promise<void> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const filePath = join(workspacePath, WorkspaceFile.MEMORY)

  await writeFile(filePath, content)
}

export async function appendLongTermMemory(agentName: string, entry: string): Promise<void> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const filePath = join(workspacePath, WorkspaceFile.MEMORY)

  const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm')
  const entryText = `\n## ${timestamp}\n\n${entry}\n`

  if (existsSync(filePath)) {
    await appendFile(filePath, entryText)
  } else {
    const header = '# Long-term Memory\n'
    await writeFile(filePath, header + entryText)
  }
}

export async function listDailyMemoryFiles(agentName: string): Promise<string[]> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const memoryDir = join(workspacePath, 'memory')

  if (!existsSync(memoryDir)) {
    return []
  }

  const { readdir } = await import('node:fs/promises')
  const files = await readdir(memoryDir)

  return files
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''))
    .sort()
    .reverse()
}
