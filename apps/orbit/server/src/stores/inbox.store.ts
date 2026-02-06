import { existsSync } from 'fs'
import { join } from 'path'

import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'

export interface InboxMessage {
  id: string
  fromAgent: string
  toAgent: string
  message: string
  messageType: 'request' | 'response'
  requestId?: string
  status: 'pending' | 'read' | 'archived'
  createdAt: string
  readAt: string | null
}

export interface SendMessageParams {
  fromAgent: string
  toAgent: string
  message: string
  messageType: 'request' | 'response'
  requestId?: string
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class InboxStore {
  private readonly agentsPath: string

  constructor(private readonly basePath: string) {
    this.agentsPath = join(basePath, 'agents')
  }

  private pendingDir(agentName: string): string {
    return join(this.agentsPath, agentName, 'inbox', 'pending')
  }

  private archiveDir(agentName: string): string {
    return join(this.agentsPath, agentName, 'inbox', 'archive')
  }

  async send(params: SendMessageParams): Promise<InboxMessage> {
    const id = generateId()
    const msg: InboxMessage = {
      id,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      message: params.message,
      messageType: params.messageType,
      requestId: params.requestId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      readAt: null,
    }

    const dir = this.pendingDir(params.toAgent)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${id}.json`), JSON.stringify(msg, null, 2))
    return msg
  }

  async getPending(agentName: string): Promise<InboxMessage[]> {
    const dir = this.pendingDir(agentName)
    if (!existsSync(dir)) return []

    const files = await readdir(dir)
    const messages: InboxMessage[] = []

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(join(dir, file), 'utf-8')
        messages.push(JSON.parse(content) as InboxMessage)
      }
    }

    return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async markRead(agentName: string, messageIds: string[]): Promise<void> {
    const pendingPath = this.pendingDir(agentName)
    const archivePath = this.archiveDir(agentName)
    await mkdir(archivePath, { recursive: true })

    for (const id of messageIds) {
      const src = join(pendingPath, `${id}.json`)
      if (!existsSync(src)) continue

      const content = await readFile(src, 'utf-8')
      const msg = JSON.parse(content) as InboxMessage
      msg.status = 'read'
      msg.readAt = new Date().toISOString()

      await writeFile(join(archivePath, `${id}.json`), JSON.stringify(msg, null, 2))
      await unlink(src)
    }
  }
}
