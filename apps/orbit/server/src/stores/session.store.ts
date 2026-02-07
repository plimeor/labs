import { existsSync } from 'fs'
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'

import type { MessageRole, SessionMessage, SessionMetadata } from '@orbit/shared/types'
import { generateId } from '@orbit/shared/utils'

export type { SessionMessage, SessionMetadata } from '@orbit/shared/types'

export interface CreateSessionParams {
  title?: string
  sdkSessionId?: string
  model?: string
  permissionMode?: string
}

export class SessionStore {
  private readonly agentsPath: string

  constructor(private readonly basePath: string) {
    this.agentsPath = join(basePath, 'agents')
  }

  private sessionsDir(agentName: string): string {
    return join(this.agentsPath, agentName, 'sessions')
  }

  private sessionDir(agentName: string, sessionId: string): string {
    return join(this.sessionsDir(agentName), sessionId)
  }

  private sessionJsonPath(agentName: string, sessionId: string): string {
    return join(this.sessionDir(agentName, sessionId), 'session.json')
  }

  private messagesPath(agentName: string, sessionId: string): string {
    return join(this.sessionDir(agentName, sessionId), 'messages.jsonl')
  }

  async create(agentName: string, params: CreateSessionParams): Promise<SessionMetadata> {
    const id = generateId()
    const dir = this.sessionDir(agentName, id)
    await mkdir(dir, { recursive: true })

    const metadata: SessionMetadata = {
      id,
      title: params.title,
      sdkSessionId: params.sdkSessionId,
      model: params.model,
      permissionMode: params.permissionMode,
      createdAt: new Date().toISOString(),
      lastMessageAt: null,
      messageCount: 0
    }

    await writeFile(this.sessionJsonPath(agentName, id), JSON.stringify(metadata, null, 2))
    await writeFile(this.messagesPath(agentName, id), '')
    return metadata
  }

  async get(agentName: string, sessionId: string): Promise<SessionMetadata | undefined> {
    const path = this.sessionJsonPath(agentName, sessionId)
    if (!existsSync(path)) return undefined
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as SessionMetadata
  }

  async appendMessage(
    agentName: string,
    sessionId: string,
    message: { role: MessageRole; content: string }
  ): Promise<void> {
    const msg: SessionMessage = {
      ...message,
      timestamp: new Date().toISOString()
    }

    await appendFile(this.messagesPath(agentName, sessionId), JSON.stringify(msg) + '\n')

    const metadata = await this.get(agentName, sessionId)
    if (metadata) {
      metadata.messageCount++
      metadata.lastMessageAt = msg.timestamp
      await writeFile(this.sessionJsonPath(agentName, sessionId), JSON.stringify(metadata, null, 2))
    }
  }

  async appendConversation(
    agentName: string,
    sessionId: string,
    userContent: string,
    assistantContent: string
  ): Promise<void> {
    await this.appendMessage(agentName, sessionId, { role: 'user', content: userContent })
    await this.appendMessage(agentName, sessionId, { role: 'assistant', content: assistantContent })
  }

  async getMessages(agentName: string, sessionId: string): Promise<SessionMessage[]> {
    const path = this.messagesPath(agentName, sessionId)
    if (!existsSync(path)) return []

    const content = await readFile(path, 'utf-8')
    return content
      .trim()
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line) as SessionMessage)
  }

  async listByAgent(agentName: string): Promise<SessionMetadata[]> {
    const dir = this.sessionsDir(agentName)
    if (!existsSync(dir)) return []

    const entries = await readdir(dir, { withFileTypes: true })
    const sessions: SessionMetadata[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const session = await this.get(agentName, entry.name)
        if (session) sessions.push(session)
      }
    }

    return sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async delete(agentName: string, sessionId: string): Promise<void> {
    const dir = this.sessionDir(agentName, sessionId)
    if (!existsSync(dir)) throw new Error(`Session not found: ${sessionId}`)
    await rm(dir, { recursive: true })
  }

  async update(agentName: string, sessionId: string, updates: Partial<SessionMetadata>): Promise<SessionMetadata> {
    const metadata = await this.get(agentName, sessionId)
    if (!metadata) throw new Error(`Session not found: ${sessionId}`)
    const updated = { ...metadata, ...updates }
    await writeFile(this.sessionJsonPath(agentName, sessionId), JSON.stringify(updated, null, 2))
    return updated
  }
}
