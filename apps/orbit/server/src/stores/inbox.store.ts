import { existsSync } from 'fs'
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'

import type { InboxMessage } from '@orbit/shared/types'
import { generateId } from '@orbit/shared/utils'

export type { InboxMessage } from '@orbit/shared/types'

export interface SendMessageParams {
  fromAgent: string
  toAgent: string
  message: string
  messageType: 'request' | 'response'
  requestId?: string
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
      readAt: null
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
    const jsonFiles = files.filter(file => file.endsWith('.json'))

    const messages = await Promise.all(
      jsonFiles.map(async file => {
        const content = await readFile(join(dir, file), 'utf-8')
        return JSON.parse(content) as InboxMessage
      })
    )

    return messages.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async claimMessage(agentName: string, messageId: string, sessionId: string): Promise<boolean> {
    const filePath = join(this.pendingDir(agentName), `${messageId}.json`)
    const lockPath = join(this.pendingDir(agentName), `${messageId}.lock`)

    // Atomic claim via exclusive lock file creation (O_EXCL)
    try {
      await writeFile(lockPath, sessionId, { flag: 'wx' })
    } catch {
      return false // Lock already exists, another process claimed it
    }

    try {
      if (!existsSync(filePath)) {
        await unlink(lockPath).catch(() => {})
        return false
      }

      const content = await readFile(filePath, 'utf-8')
      const msg = JSON.parse(content) as InboxMessage

      if (msg.claimedBy) {
        await unlink(lockPath).catch(() => {})
        return false
      }

      msg.claimedBy = sessionId
      msg.claimedAt = new Date().toISOString()
      await writeFile(filePath, JSON.stringify(msg, null, 2))
      return true
    } catch {
      await unlink(lockPath).catch(() => {})
      return false
    }
  }

  async getPendingUnclaimed(agentName: string): Promise<InboxMessage[]> {
    const pending = await this.getPending(agentName)
    return pending.filter(m => !m.claimedBy)
  }

  async markRead(agentName: string, messageIds: string[]): Promise<void> {
    const pendingPath = this.pendingDir(agentName)
    const archivePath = this.archiveDir(agentName)
    await mkdir(archivePath, { recursive: true })

    await Promise.all(
      messageIds.map(async id => {
        const src = join(pendingPath, `${id}.json`)
        if (!existsSync(src)) return

        const content = await readFile(src, 'utf-8')
        const msg = JSON.parse(content) as InboxMessage
        msg.status = 'read'
        msg.readAt = new Date().toISOString()

        await writeFile(join(archivePath, `${id}.json`), JSON.stringify(msg, null, 2))
        await unlink(src)

        // Clean up lock file if it exists
        const lockPath = join(pendingPath, `${id}.lock`)
        await unlink(lockPath).catch(() => {})
      })
    )
  }
}
