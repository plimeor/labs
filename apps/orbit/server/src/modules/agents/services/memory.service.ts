import { existsSync } from 'fs'
import { join } from 'path'

import { format } from 'date-fns'
import { readFile, writeFile, appendFile, mkdir } from 'fs/promises'

import { getAgentWorkspacePath } from './workspace.service'

export interface MemoryEntry {
  sessionType: 'chat' | 'heartbeat' | 'cron'
  prompt: string
  result: string
  timestamp: Date
}

export async function appendDailyMemory(agentName: string, entry: MemoryEntry): Promise<void> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const dailyDir = join(workspacePath, 'memory', 'daily')
  const today = format(new Date(), 'yyyy-MM-dd')
  const filePath = join(dailyDir, `${today}.md`)

  // Ensure daily directory exists
  await mkdir(dailyDir, { recursive: true })

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

export async function readDailyMemory(agentName: string, date: Date): Promise<string | null> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const dateStr = format(date, 'yyyy-MM-dd')
  const filePath = join(workspacePath, 'memory', 'daily', `${dateStr}.md`)

  if (!existsSync(filePath)) {
    return null
  }

  return readFile(filePath, 'utf-8')
}

export async function readLongTermMemory(agentName: string): Promise<string | null> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const filePath = join(workspacePath, 'memory', 'long-term.md')

  if (!existsSync(filePath)) {
    return null
  }

  return readFile(filePath, 'utf-8')
}

export async function updateLongTermMemory(agentName: string, content: string): Promise<void> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const filePath = join(workspacePath, 'memory', 'long-term.md')

  await writeFile(filePath, content)
}

export async function appendLongTermMemory(agentName: string, entry: string): Promise<void> {
  const workspacePath = getAgentWorkspacePath(agentName)
  const filePath = join(workspacePath, 'memory', 'long-term.md')

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
  const dailyDir = join(workspacePath, 'memory', 'daily')

  if (!existsSync(dailyDir)) {
    return []
  }

  const { readdir } = await import('fs/promises')
  const files = await readdir(dailyDir)

  return files
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''))
    .sort()
    .reverse()
}
