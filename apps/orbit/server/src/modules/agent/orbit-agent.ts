import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { logger } from '@plimeor-labs/logger'

import { createMemoryMcpServer } from '@/modules/mcp/memory-tools.mcp'
import { createOrbitMcpServer } from '@/modules/mcp/orbit-tools.mcp'
import type { AgentStore } from '@/stores/agent.store'
import type { InboxStore } from '@/stores/inbox.store'
import type { SessionStore } from '@/stores/session.store'
import type { TaskStore } from '@/stores/task.store'

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
  private deps: OrbitAgentDeps
  private sdkSessionId?: string
  private abortController?: AbortController

  constructor(name: string, deps: OrbitAgentDeps) {
    this.name = name
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

    // Check inbox for pending messages
    const pendingMessages = await this.deps.inboxStore.getPending(this.name)
    const inboxMessages: InboxMessage[] = pendingMessages.map(m => ({
      id: typeof m.id === 'string' ? parseInt(m.id, 10) || 0 : 0,
      fromAgent: m.fromAgent,
      message: m.message
    }))

    // Compose system prompt (reuses existing context.service)
    const systemPrompt = await composeSystemPrompt(this.name, sessionType, inboxMessages)

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
          this.sdkSessionId = (message as unknown as { sessionId?: string }).sessionId
        }

        // Capture result text
        if (message.type === 'result') {
          const resultMsg = message as unknown as { result?: string }
          if (resultMsg.result) result = resultMsg.result
        }

        yield message
      }
    } finally {
      // Mark inbox messages as read
      if (pendingMessages.length > 0) {
        await this.deps.inboxStore.markRead(
          this.name,
          pendingMessages.map(m => m.id)
        )
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
