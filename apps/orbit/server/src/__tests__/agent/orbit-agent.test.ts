import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_PATH = '/tmp/orbit-agent-test'

import { AgentPool } from '@/agent/agent-pool'
import { OrbitAgent } from '@/agent/orbit-agent'
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
    writeFileSync(
      join(TEST_CONFIG_PATH, 'agents', 'test-bot', 'IDENTITY.md'),
      '# Test Bot\n\nA test agent.',
    )
  })

  afterEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  it('should construct OrbitAgent with name and config', () => {
    const agent = new OrbitAgent('test-bot', {
      basePath: TEST_CONFIG_PATH,
      agentStore,
      taskStore,
      inboxStore,
      sessionStore,
    })

    expect(agent.name).toBe('test-bot')
  })

  it('should build MCP server configs', async () => {
    const agent = new OrbitAgent('test-bot', {
      basePath: TEST_CONFIG_PATH,
      agentStore,
      taskStore,
      inboxStore,
      sessionStore,
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
      sessionStore,
    })

    await agentStore.create({ name: 'bot-a' })
  })

  afterEach(() => {
    pool.stopEviction()
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  it('should create agent on first get', async () => {
    const agent = await pool.get('bot-a')
    expect(agent.name).toBe('bot-a')
  })

  it('should return same instance on second get', async () => {
    const agent1 = await pool.get('bot-a')
    const agent2 = await pool.get('bot-a')
    expect(agent1).toBe(agent2)
  })

  it('should release agent from pool', async () => {
    await pool.get('bot-a')
    expect(pool.has('bot-a')).toBe(true)
    pool.release('bot-a')
    expect(pool.has('bot-a')).toBe(false)
  })

  it('should track pool size', async () => {
    expect(pool.size()).toBe(0)
    await pool.get('bot-a')
    expect(pool.size()).toBe(1)
  })
})
