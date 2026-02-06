import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { rmSync, mkdirSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_PATH = '/tmp/orbit-inbox-test'

import { InboxStore } from '@/stores/inbox.store'

describe('InboxStore', () => {
  let store: InboxStore

  beforeEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
    for (const name of ['bot-a', 'bot-b']) {
      mkdirSync(join(TEST_CONFIG_PATH, 'agents', name, 'inbox', 'pending'), { recursive: true })
      mkdirSync(join(TEST_CONFIG_PATH, 'agents', name, 'inbox', 'archive'), { recursive: true })
    }
    store = new InboxStore(TEST_CONFIG_PATH)
  })

  afterEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  describe('send', () => {
    it('should create a pending message in target agent inbox', async () => {
      const msg = await store.send({
        fromAgent: 'bot-a',
        toAgent: 'bot-b',
        message: 'Hello from A',
        messageType: 'request',
      })

      expect(msg.id).toBeDefined()
      expect(msg.fromAgent).toBe('bot-a')
      expect(msg.toAgent).toBe('bot-b')
      expect(msg.status).toBe('pending')
    })
  })

  describe('getPending', () => {
    it('should return pending messages for agent', async () => {
      await store.send({
        fromAgent: 'bot-a',
        toAgent: 'bot-b',
        message: 'Msg 1',
        messageType: 'request',
      })
      await store.send({
        fromAgent: 'bot-a',
        toAgent: 'bot-b',
        message: 'Msg 2',
        messageType: 'request',
      })

      const pending = await store.getPending('bot-b')
      expect(pending.length).toBe(2)
    })

    it('should return empty array if no pending messages', async () => {
      const pending = await store.getPending('bot-a')
      expect(pending).toEqual([])
    })
  })

  describe('markRead', () => {
    it('should move message from pending to archive', async () => {
      const msg = await store.send({
        fromAgent: 'bot-a',
        toAgent: 'bot-b',
        message: 'Hello',
        messageType: 'request',
      })

      await store.markRead('bot-b', [msg.id])

      const pending = await store.getPending('bot-b')
      expect(pending.length).toBe(0)
    })
  })
})
