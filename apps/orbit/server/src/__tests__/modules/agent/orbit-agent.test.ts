import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_PATH = '/tmp/orbit-agent-test'

import { AgentPool } from '@/modules/agent/agent-pool'
import { OrbitAgent } from '@/modules/agent/orbit-agent'
import { AgentStore } from '@/stores/agent.store'
import { InboxStore } from '@/stores/inbox.store'
import { SessionStore } from '@/stores/session.store'
import { TaskStore } from '@/stores/task.store'

describe('OrbitAgent', () => {
  let agentStore: AgentStore
  let taskStore: TaskStore
  let inboxStore: InboxStore
  let sessionStore: SessionStore

  beforeEach(async () => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
    agentStore = new AgentStore(TEST_CONFIG_PATH)
    taskStore = new TaskStore(TEST_CONFIG_PATH)
    inboxStore = new InboxStore(TEST_CONFIG_PATH)
    sessionStore = new SessionStore(TEST_CONFIG_PATH)

    // Create an agent workspace with IDENTITY.md
    await agentStore.create({ name: 'test-bot' })
    writeFileSync(join(TEST_CONFIG_PATH, 'agents', 'test-bot', 'IDENTITY.md'), '# Test Bot\n\nA test agent.')
  })

  afterEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  it('should accept sessionId in constructor', () => {
    const agent = new OrbitAgent('test-bot', 'session-123', {
      basePath: TEST_CONFIG_PATH,
      agentStore,
      taskStore,
      inboxStore,
      sessionStore
    })

    expect(agent.name).toBe('test-bot')
    expect(agent.sessionId).toBe('session-123')
  })

  it('should build MCP server configs', async () => {
    const agent = new OrbitAgent('test-bot', 'session-123', {
      basePath: TEST_CONFIG_PATH,
      agentStore,
      taskStore,
      inboxStore,
      sessionStore
    })

    const servers = await agent.buildMcpServers()
    expect(servers['orbit-tools']).toBeDefined()
    expect(servers['orbit-tools'].name).toBe('orbit-tools')
  })
})

describe('AgentPool', () => {
  let pool: AgentPool
  let agentStore: AgentStore

  beforeEach(async () => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
    agentStore = new AgentStore(TEST_CONFIG_PATH)
    const taskStore = new TaskStore(TEST_CONFIG_PATH)
    const inboxStore = new InboxStore(TEST_CONFIG_PATH)
    const sessionStore = new SessionStore(TEST_CONFIG_PATH)

    pool = new AgentPool({
      basePath: TEST_CONFIG_PATH,
      agentStore,
      taskStore,
      inboxStore,
      sessionStore
    })

    await agentStore.create({ name: 'bot-a' })
  })

  afterEach(() => {
    pool.stopEviction()
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  it('should create separate instances for different sessions', async () => {
    const a1 = await pool.get('bot-a', 'session-1')
    const a2 = await pool.get('bot-a', 'session-2')
    expect(a1).not.toBe(a2)
    expect(pool.size()).toBe(2)
  })

  it('should return same instance for same agent+session', async () => {
    const a1 = await pool.get('bot-a', 'session-1')
    const a2 = await pool.get('bot-a', 'session-1')
    expect(a1).toBe(a2)
    expect(pool.size()).toBe(1)
  })

  it('should release by agent+session key', async () => {
    await pool.get('bot-a', 'session-1')
    await pool.get('bot-a', 'session-2')
    pool.release('bot-a', 'session-1')
    expect(pool.size()).toBe(1)
    expect(pool.has('bot-a', 'session-2')).toBe(true)
  })

  it('should track pool size', async () => {
    expect(pool.size()).toBe(0)
    await pool.get('bot-a', 'session-1')
    expect(pool.size()).toBe(1)
  })
})
