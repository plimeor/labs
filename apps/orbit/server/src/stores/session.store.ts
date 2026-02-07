import { existsSync } from 'fs'
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'

export interface SessionMetadata {
  id: string
  title?: string
  sdkSessionId?: string
  model?: string
  permissionMode?: string
  createdAt: string
  lastMessageAt: string | null
  messageCount: number
}

export interface SessionMessage {
  // FIXME 改成 enum 枚举
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface CreateSessionParams {
  sdkSessionId?: string
  model?: string
  permissionMode?: string
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

  async appendMessage(agentName: string, sessionId: string, message: Omit<SessionMessage, 'timestamp'>): Promise<void> {
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
