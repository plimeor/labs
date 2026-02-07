import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { logger } from '@plimeor-labs/logger'

import { createMemoryMcpServer } from '@/modules/mcp/memory-tools.mcp'
import { createOrbitMcpServer } from '@/modules/mcp/orbit-tools.mcp'
import type { AgentStore } from '@/stores/agent.store'
import type { InboxStore } from '@/stores/inbox.store'
import type { SessionStore } from '@/stores/session.store'
import type { TaskStore } from '@/stores/task.store'
import { extractResultText } from '@/utils/sdk'

import { composeSystemPrompt, type InboxMessage, type SessionType } from './services/context.service'
import { appendDailyMemory } from './services/memory.service'
import * as qmd from './services/qmd.service'
import { buildSourceServers } from './source-builder'

export interface OrbitAgentDeps {
  basePath: string
  agentStore: AgentStore
  taskStore: TaskStore
  inboxStore: InboxStore
  sessionStore: SessionStore
}

export interface ChatOptions {
  sessionType: SessionType
  sessionId?: string
  model?: string
}

export class OrbitAgent {
  readonly name: string
  readonly sessionId: string
  private deps: OrbitAgentDeps
  private sdkSessionId?: string
  private abortController?: AbortController

  constructor(name: string, sessionId: string, deps: OrbitAgentDeps) {
    this.name = name
    this.sessionId = sessionId
    this.deps = deps
  }

  async buildMcpServers() {
    const servers: Record<string, any> = {
      'orbit-tools': createOrbitMcpServer(this.name, {
        taskStore: this.deps.taskStore,
        inboxStore: this.deps.inboxStore
      })
    }

    if (qmd.isQmdAvailable()) {
      servers['memory-tools'] = createMemoryMcpServer(this.name)
    }

    // Add external MCP sources
    const externalServers = await buildSourceServers(this.deps.basePath, this.name)
    Object.assign(servers, externalServers)

    return servers
  }

  async *chat(prompt: string, opts: ChatOptions): AsyncGenerator<SDKMessage> {
    const { sessionType } = opts

    // Try to load SDK session ID from store for resume
    if (!this.sdkSessionId) {
      const session = await this.deps.sessionStore.get(this.name, this.sessionId)
      this.sdkSessionId = session?.sdkSessionId
    }

    // Claim unclaimed inbox messages for this session
    const unclaimed = await this.deps.inboxStore.getPendingUnclaimed(this.name)
    const claimedIds: string[] = []
    const claimedMessages: InboxMessage[] = []
    for (const msg of unclaimed) {
      const ok = await this.deps.inboxStore.claimMessage(this.name, msg.id, this.sessionId)
      if (ok) {
        claimedIds.push(msg.id)
        claimedMessages.push({
          id: msg.id,
          fromAgent: msg.fromAgent,
          message: msg.message
        })
      }
    }

    // Compose system prompt (reuses existing context.service)
    const systemPrompt = await composeSystemPrompt(this.name, sessionType, claimedMessages)

    // Build Agent SDK options
    const agentWorkspacePath = this.deps.agentStore.getWorkingDir(this.name)
    const mcpServers = await this.buildMcpServers()

    this.abortController = new AbortController()

    const options = {
      model: opts.model || 'claude-sonnet-4-5-20250929',
      cwd: agentWorkspacePath,
      systemPrompt: {
        type: 'preset' as const,
        preset: 'claude_code' as const,
        append: systemPrompt
      },
      tools: { type: 'preset' as const, preset: 'claude_code' as const },
      mcpServers,
      resume: this.sdkSessionId,
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      maxTurns: 50,
      abortController: this.abortController
    }

    let result = ''

    try {
      const q = query({ prompt, options })

      for await (const message of q) {
        // Capture SDK session ID from system message
        if (message.type === 'system') {
          const newSdkId = (message as unknown as { sessionId?: string }).sessionId
          if (newSdkId) {
            this.sdkSessionId = newSdkId
            // Persist SDK session ID to store
            await this.deps.sessionStore.update(this.name, this.sessionId, { sdkSessionId: newSdkId })
          }
        }

        // Capture result text
        const text = extractResultText(message)
        if (text !== undefined) result = text

        yield message
      }
    } finally {
      // Mark claimed messages as read (use pre-collected IDs, no re-querying)
      if (claimedIds.length > 0) {
        await this.deps.inboxStore.markRead(this.name, claimedIds)
      }

      // Update last active timestamp
      await this.deps.agentStore.updateLastActive(this.name)

      // Write daily memory entry
      await appendDailyMemory(this.name, {
        sessionType,
        prompt,
        result,
        timestamp: new Date()
      })

      // Trigger async QMD index update
      if (qmd.isQmdAvailable()) {
        qmd.updateIndex(this.name).catch(err => {
          logger.warn(`Failed to update QMD index for agent ${this.name}`, { error: err })
        })
      }
    }
  }

  abort(): void {
    this.abortController?.abort()
  }
}
