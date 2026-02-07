import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_PATH = '/tmp/orbit-mcp-test'

import { createOrbitMcpServer } from '@/modules/mcp/orbit-tools.mcp'
import { InboxStore } from '@/stores/inbox.store'
import { TaskStore } from '@/stores/task.store'

describe('orbit-tools MCP server', () => {
  let taskStore: TaskStore
  let inboxStore: InboxStore
  const agentName = 'test-bot'

  beforeEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
    for (const name of [agentName, 'other-bot']) {
      mkdirSync(join(TEST_CONFIG_PATH, 'agents', name, 'tasks', 'runs'), { recursive: true })
      mkdirSync(join(TEST_CONFIG_PATH, 'agents', name, 'inbox', 'pending'), { recursive: true })
      mkdirSync(join(TEST_CONFIG_PATH, 'agents', name, 'inbox', 'archive'), { recursive: true })
    }
    writeFileSync(
      join(TEST_CONFIG_PATH, 'agents', 'other-bot', 'agent.json'),
      JSON.stringify({
        name: 'other-bot',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastActiveAt: null
      })
    )
    taskStore = new TaskStore(TEST_CONFIG_PATH)
    inboxStore = new InboxStore(TEST_CONFIG_PATH)
  })

  afterEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  it('should create MCP server with orbit tools', () => {
    const server = createOrbitMcpServer(agentName, { taskStore, inboxStore })
    expect(server).toBeDefined()
    expect(server.name).toBe('orbit-tools')
  })
})
