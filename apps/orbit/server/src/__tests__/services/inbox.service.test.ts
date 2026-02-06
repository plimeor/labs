/**
 * BDD Tests for Inbox Service
 *
 * Tests agent-to-agent messaging operations including:
 * - Sending messages between agents
 * - Checking inbox for pending messages
 * - Marking messages as read
 * - Archiving messages
 * - Message history retrieval
 */

import { beforeEach, describe, expect, it } from 'bun:test'

import { type Agent, agents } from '@db/agents'
import { agentInbox } from '@db/inbox'
import { eq } from 'drizzle-orm'

import { db } from '@/core/db'
import {
  archiveInboxMessages,
  checkInbox,
  checkInboxByName,
  getInboxHistory,
  getSentMessages,
  markInboxRead,
  sendToAgent,
  sendToAgentByName
} from '@/modules/agents/services/inbox.service'

import { clearAllTables } from '../helpers/test-db'

// Helper to create test agents (directly in DB, bypassing workspace creation)
async function createTestAgent(name: string): Promise<Agent> {
  const result = await db
    .insert(agents)
    .values({
      name,
      workspacePath: `/tmp/orbit/agents/${name}`,
      status: 'active'
    })
    .returning()
  return result[0]!
}

// ============================================================
// BDD Tests
// ============================================================

describe('Inbox Service', () => {
  beforeEach(async () => {
    await clearAllTables()
  })

  // ----------------------------------------------------------
  // Feature: Send Message Between Agents
  // ----------------------------------------------------------
  describe('Feature: Send Message Between Agents', () => {
    it('should send request message by agent ID with pending status', async () => {
      const sender = await createTestAgent('sender')
      const receiver = await createTestAgent('receiver')

      const msg = await sendToAgent(sender.id, receiver.id, 'Hello receiver!')

      expect(msg.status).toBe('pending')
      expect(msg.messageType).toBe('request')
      expect(msg.message).toBe('Hello receiver!')

      const inbox = await checkInbox(receiver.id)
      expect(inbox.length).toBe(1)
      expect(inbox[0]?.message).toBe('Hello receiver!')
    })

    it('should send message by agent name', async () => {
      await createTestAgent('alice')
      await createTestAgent('bob')

      await sendToAgentByName('alice', 'bob', 'Hi Bob!')

      const inbox = await checkInboxByName('bob')
      expect(inbox.length).toBe(1)
      expect(inbox[0]?.message).toBe('Hi Bob!')
    })

    it('should send response message type', async () => {
      await createTestAgent('alice')
      await createTestAgent('bob')

      await sendToAgentByName('bob', 'alice', 'The answer is 4', 'response')

      const inbox = await checkInboxByName('alice')
      expect(inbox[0]?.messageType).toBe('response')
    })

    it('should fail to send to non-existent agent', async () => {
      await createTestAgent('sender')

      await expect(sendToAgentByName('sender', 'ghost', 'Hello?')).rejects.toThrow('Agent not found: ghost')
    })

    it('should fail to send from non-existent agent', async () => {
      await createTestAgent('receiver')

      await expect(sendToAgentByName('ghost', 'receiver', 'Hello!')).rejects.toThrow('Agent not found: ghost')
    })
  })

  // ----------------------------------------------------------
  // Feature: Check Inbox
  // ----------------------------------------------------------
  describe('Feature: Check Inbox', () => {
    it('should return all pending messages', async () => {
      const sender = await createTestAgent('sender')
      const receiver = await createTestAgent('receiver')

      await sendToAgent(sender.id, receiver.id, 'Message 1')
      await sendToAgent(sender.id, receiver.id, 'Message 2')
      await sendToAgent(sender.id, receiver.id, 'Message 3')

      const inbox = await checkInbox(receiver.id)
      const messages = inbox.map(m => m.message)

      expect(inbox.length).toBe(3)
      expect(messages).toContain('Message 1')
      expect(messages).toContain('Message 2')
      expect(messages).toContain('Message 3')
    })

    it('should return empty list for agent with no messages', async () => {
      const lonely = await createTestAgent('lonely')
      const inbox = await checkInbox(lonely.id)
      expect(inbox).toEqual([])
    })

    it('should exclude read messages from inbox', async () => {
      const sender = await createTestAgent('sender')
      const receiver = await createTestAgent('receiver')

      const msg1 = await sendToAgent(sender.id, receiver.id, 'Old message')
      await sendToAgent(sender.id, receiver.id, 'New message')
      await markInboxRead([msg1.id])

      const inbox = await checkInbox(receiver.id)
      expect(inbox.length).toBe(1)
      expect(inbox[0]?.message).toBe('New message')
    })

    it('should return empty list for non-existent agent', async () => {
      const inbox = await checkInboxByName('nobody')
      expect(inbox).toEqual([])
    })
  })

  // ----------------------------------------------------------
  // Feature: Mark Messages as Read
  // ----------------------------------------------------------
  describe('Feature: Mark Messages as Read', () => {
    it('should mark single message as read with timestamp', async () => {
      const sender = await createTestAgent('sender')
      const receiver = await createTestAgent('receiver')
      const msg = await sendToAgent(sender.id, receiver.id, 'Please read me')
      const before = new Date()

      await markInboxRead([msg.id])

      const updated = await db.select().from(agentInbox).where(eq(agentInbox.id, msg.id)).get()
      expect(updated?.status).toBe('read')
      expect(updated?.readAt).toBeDefined()
      expect(updated?.readAt?.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    })

    it('should mark multiple messages as read', async () => {
      const sender = await createTestAgent('sender')
      const receiver = await createTestAgent('receiver')

      const msg1 = await sendToAgent(sender.id, receiver.id, 'Message 1')
      const msg2 = await sendToAgent(sender.id, receiver.id, 'Message 2')
      const msg3 = await sendToAgent(sender.id, receiver.id, 'Message 3')

      await markInboxRead([msg1.id, msg2.id, msg3.id])

      const inbox = await checkInbox(receiver.id)
      expect(inbox.length).toBe(0)

      const history = await getInboxHistory(receiver.id)
      expect(history.every(m => m.status === 'read')).toBe(true)
    })

    it('should handle empty list gracefully', async () => {
      await expect(markInboxRead([])).resolves.toBeUndefined()
    })
  })

  // ----------------------------------------------------------
  // Feature: Archive Messages
  // ----------------------------------------------------------
  describe('Feature: Archive Messages', () => {
    it('should archive read message', async () => {
      const sender = await createTestAgent('sender')
      const receiver = await createTestAgent('receiver')
      const msg = await sendToAgent(sender.id, receiver.id, 'Archive me')
      await markInboxRead([msg.id])

      await archiveInboxMessages([msg.id])

      const updated = await db.select().from(agentInbox).where(eq(agentInbox.id, msg.id)).get()
      expect(updated?.status).toBe('archived')
    })
  })

  // ----------------------------------------------------------
  // Feature: Get Message History
  // ----------------------------------------------------------
  describe('Feature: Get Message History', () => {
    it('should include messages with all statuses', async () => {
      const sender = await createTestAgent('sender')
      const receiver = await createTestAgent('receiver')

      await sendToAgent(sender.id, receiver.id, 'Pending')
      const msg2 = await sendToAgent(sender.id, receiver.id, 'Read')
      const msg3 = await sendToAgent(sender.id, receiver.id, 'Archived')

      await markInboxRead([msg2.id])
      await markInboxRead([msg3.id])
      await archiveInboxMessages([msg3.id])

      const history = await getInboxHistory(receiver.id)
      const statuses = history.map(m => m.status)

      expect(history.length).toBe(3)
      expect(statuses).toContain('pending')
      expect(statuses).toContain('read')
      expect(statuses).toContain('archived')
    })

    it('should return all sent messages', async () => {
      const sender = await createTestAgent('sender')
      const receiver1 = await createTestAgent('receiver1')
      const receiver2 = await createTestAgent('receiver2')

      await sendToAgent(sender.id, receiver1.id, 'To receiver 1')
      await sendToAgent(sender.id, receiver2.id, 'To receiver 2')

      const sent = await getSentMessages(sender.id)
      const messages = sent.map(m => m.message)

      expect(sent.length).toBe(2)
      expect(messages).toContain('To receiver 1')
      expect(messages).toContain('To receiver 2')
    })

    it('should respect limit parameter', async () => {
      const sender = await createTestAgent('sender')
      const receiver = await createTestAgent('receiver')

      await Promise.all(Array.from({ length: 10 }, (_, i) => sendToAgent(sender.id, receiver.id, `Message ${i}`)))

      const history = await getInboxHistory(receiver.id, 3)
      expect(history.length).toBe(3)
    })
  })
})
