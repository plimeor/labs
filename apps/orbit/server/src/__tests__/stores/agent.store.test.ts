import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_PATH = '/tmp/orbit-store-test'

import { AgentStore } from '@/stores/agent.store'

describe('AgentStore', () => {
  let store: AgentStore

  beforeEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
    mkdirSync(join(TEST_CONFIG_PATH, 'agents'), { recursive: true })
    store = new AgentStore(TEST_CONFIG_PATH)
  })

  afterEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  describe('create', () => {
    it('should create agent.json and return agent metadata', async () => {
      const agent = await store.create({ name: 'test-bot' })

      expect(agent.name).toBe('test-bot')
      expect(agent.status).toBe('active')
      expect(agent.createdAt).toBeDefined()
      expect(existsSync(join(TEST_CONFIG_PATH, 'agents', 'test-bot', 'agent.json'))).toBe(true)
    })

    it('should throw if agent already exists', async () => {
      await store.create({ name: 'test-bot' })
      expect(store.create({ name: 'test-bot' })).rejects.toThrow('already exists')
    })
  })

  describe('get', () => {
    it('should return agent by name', async () => {
      await store.create({ name: 'test-bot' })
      const agent = await store.get('test-bot')

      expect(agent).toBeDefined()
      expect(agent!.name).toBe('test-bot')
    })

    it('should return undefined for non-existent agent', async () => {
      const agent = await store.get('no-such-agent')
      expect(agent).toBeUndefined()
    })
  })

  describe('list', () => {
    it('should list all agents', async () => {
      await store.create({ name: 'bot-a' })
      await store.create({ name: 'bot-b' })

      const agents = await store.list()
      const names = agents.map(a => a.name).sort()

      expect(names).toEqual(['bot-a', 'bot-b'])
    })
  })

  describe('update', () => {
    it('should update lastActiveAt', async () => {
      await store.create({ name: 'test-bot' })
      const before = await store.get('test-bot')
      expect(before!.lastActiveAt).toBeNull()

      await store.updateLastActive('test-bot')
      const after = await store.get('test-bot')

      expect(after!.lastActiveAt).not.toBeNull()
    })
  })

  describe('delete', () => {
    it('should remove agent directory', async () => {
      await store.create({ name: 'test-bot' })
      await store.delete('test-bot')

      expect(existsSync(join(TEST_CONFIG_PATH, 'agents', 'test-bot'))).toBe(false)
      expect(await store.get('test-bot')).toBeUndefined()
    })
  })
})
