import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_PATH = '/tmp/orbit-session-test'

import { SessionStore } from '@/stores/session.store'

describe('SessionStore', () => {
  let store: SessionStore
  const agentName = 'test-bot'

  beforeEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
    mkdirSync(join(TEST_CONFIG_PATH, 'agents', agentName, 'sessions'), { recursive: true })
    store = new SessionStore(TEST_CONFIG_PATH)
  })

  afterEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  describe('create', () => {
    it('should create session directory with session.json and messages.jsonl', async () => {
      const session = await store.create(agentName, { sdkSessionId: 'sdk-123' })

      expect(session.id).toBeDefined()
      expect(session.sdkSessionId).toBe('sdk-123')
    })
  })

  describe('get', () => {
    it('should return session metadata', async () => {
      const created = await store.create(agentName, { sdkSessionId: 'sdk-123' })
      const session = await store.get(agentName, created.id)

      expect(session).toBeDefined()
      expect(session!.sdkSessionId).toBe('sdk-123')
    })
  })

  describe('appendMessage', () => {
    it('should append message to messages.jsonl', async () => {
      const session = await store.create(agentName, {})

      await store.appendMessage(agentName, session.id, {
        role: 'user',
        content: 'Hello'
      })
      await store.appendMessage(agentName, session.id, {
        role: 'assistant',
        content: 'Hi there!'
      })

      const messages = await store.getMessages(agentName, session.id)
      expect(messages.length).toBe(2)
      expect(messages[0]!.role).toBe('user')
      expect(messages[1]!.content).toBe('Hi there!')
    })
  })

  describe('listByAgent', () => {
    it('should list all sessions for an agent', async () => {
      await store.create(agentName, {})
      await store.create(agentName, {})

      const sessions = await store.listByAgent(agentName)
      expect(sessions.length).toBe(2)
    })
  })

  describe('delete', () => {
    it('should delete a session directory', async () => {
      const session = await store.create(agentName, {})
      await store.delete(agentName, session.id)
      const result = await store.get(agentName, session.id)
      expect(result).toBeUndefined()
    })

    it('should throw when deleting non-existent session', async () => {
      await expect(store.delete(agentName, 'nonexistent')).rejects.toThrow()
    })
  })

  describe('update', () => {
    it('should update session metadata fields', async () => {
      const session = await store.create(agentName, {})
      const updated = await store.update(agentName, session.id, { title: 'My Chat' })
      expect(updated.title).toBe('My Chat')

      const fetched = await store.get(agentName, session.id)
      expect(fetched?.title).toBe('My Chat')
    })
  })
})
