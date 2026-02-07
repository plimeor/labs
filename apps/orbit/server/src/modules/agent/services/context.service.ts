import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { format, subDays } from 'date-fns'

import { getAgentWorkspacePath } from './workspace.service'

const MAX_FILE_LENGTH = 50_000

async function readFileWithTruncation(filePath: string): Promise<string | undefined> {
  if (!existsSync(filePath)) {
    return undefined
  }

  try {
    let content = await readFile(filePath, 'utf-8')

    if (content.length > MAX_FILE_LENGTH) {
      const headLength = Math.floor(MAX_FILE_LENGTH * 0.7)
      const tailLength = Math.floor(MAX_FILE_LENGTH * 0.2)
      const head = content.slice(0, headLength)
      const tail = content.slice(-tailLength)
      content = `${head}\n\n[... content truncated ...]\n\n${tail}`
    }

    return content
  } catch {
    return undefined
  }
}

export type SessionType = 'chat' | 'heartbeat' | 'cron'

export interface InboxMessage {
  id: number
  fromAgent: string
  message: string
}

export async function composeSystemPrompt(
  agentName: string,
  sessionType: SessionType,
  inbox: InboxMessage[] = []
): Promise<string> {
  const workspacePath = getAgentWorkspacePath(agentName)

  // Load core personality files
  const [agents, soul, identity, user, tools, heartbeat, bootstrap] = await Promise.all([
    readFileWithTruncation(join(workspacePath, 'AGENTS.md')),
    readFileWithTruncation(join(workspacePath, 'SOUL.md')),
    readFileWithTruncation(join(workspacePath, 'IDENTITY.md')),
    readFileWithTruncation(join(workspacePath, 'USER.md')),
    readFileWithTruncation(join(workspacePath, 'TOOLS.md')),
    readFileWithTruncation(join(workspacePath, 'HEARTBEAT.md')),
    readFileWithTruncation(join(workspacePath, 'BOOTSTRAP.md'))
  ])

  // Load recent memory
  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  const [memoryToday, memoryYesterday, longTerm] = await Promise.all([
    readFileWithTruncation(join(workspacePath, 'memory', `${today}.md`)),
    readFileWithTruncation(join(workspacePath, 'memory', `${yesterday}.md`)),
    readFileWithTruncation(join(workspacePath, 'MEMORY.md'))
  ])

  // Build system prompt
  const sections: string[] = []

  // Identity first
  if (identity) {
    sections.push(identity)
  }

  // Soul/personality
  if (soul) {
    sections.push(soul)
  }

  // User information
  if (user) {
    sections.push(user)
  }

  // Operating protocol
  if (agents) {
    sections.push(agents)
  }

  // Tools documentation
  if (tools) {
    sections.push(tools)
  }

  // Include heartbeat for heartbeat sessions
  if (sessionType === 'heartbeat' && heartbeat) {
    sections.push(`## Heartbeat Tasks\n\n${heartbeat}`)
  }

  // Include bootstrap if it exists (first run)
  if (bootstrap) {
    sections.push(`## First Run Setup\n\n${bootstrap}`)
  }

  // Memory section
  const memoryParts: string[] = []

  if (longTerm) {
    memoryParts.push(`### Long-term Memory\n${longTerm}`)
  }

  if (memoryYesterday || memoryToday) {
    memoryParts.push('### Recent Activity')

    if (memoryYesterday) {
      memoryParts.push(`**Yesterday (${yesterday}):**\n${memoryYesterday}`)
    }

    if (memoryToday) {
      memoryParts.push(`**Today (${today}):**\n${memoryToday}`)
    }
  }

  if (memoryParts.length > 0) {
    sections.push(`## Memory\n\n${memoryParts.join('\n\n')}`)
  }

  // Inbox messages
  if (inbox.length > 0) {
    const inboxSection = inbox.map(msg => `- From **${msg.fromAgent}**: ${msg.message}`).join('\n')
    sections.push(`## Inbox\n\nYou have ${inbox.length} message(s):\n${inboxSection}`)
  }

  // Session type context
  sections.push(`## Current Session\n\n- **Type**: ${sessionType}\n- **Date**: ${today}`)

  return sections.join('\n\n---\n\n')
}
