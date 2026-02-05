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

import { describe, it, expect, beforeEach } from 'bun:test'

import { agents, type Agent } from '@db/agents'
import { agentInbox } from '@db/inbox'
import { eq } from 'drizzle-orm'

import { db } from '@/core/db'
import {
  sendToAgent,
  sendToAgentByName,
  checkInbox,
  checkInboxByName,
  markInboxRead,
  archiveInboxMessages,
  getInboxHistory,
  getSentMessages,
} from '@/modules/agents/services/inbox.service'

import { clearAllTables } from '../helpers/test-db'

// Helper to create test agents (directly in DB, bypassing workspace creation)
async function createTestAgent(name: string): Promise<Agent> {
  const result = await db
    .insert(agents)
    .values({
      name,
      workspacePath: `/tmp/orbit/agents/${name}`,
      status: 'active',
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
    describe('Scenario: Successfully send a request message by agent ID', () => {
      it('Given two agents "sender" and "receiver" exist', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        expect(sender.id).toBeGreaterThan(0)
        expect(receiver.id).toBeGreaterThan(0)
      })

      it('When sender sends a message to receiver', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Hello receiver!')
        expect(msg.id).toBeGreaterThan(0)
      })

      it('Then the message should be stored with pending status', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Hello receiver!')

        expect(msg.status).toBe('pending')
        expect(msg.messageType).toBe('request')
        expect(msg.message).toBe('Hello receiver!')
      })

      it('And the message should appear in receiver inbox', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        await sendToAgent(sender.id, receiver.id, 'Hello receiver!')

        const inbox = await checkInbox(receiver.id)
        expect(inbox.length).toBe(1)
        expect(inbox[0]!.message).toBe('Hello receiver!')
      })
    })

    describe('Scenario: Send message by agent name', () => {
      it('Given agents "alice" and "bob" exist', async () => {
        await createTestAgent('alice')
        await createTestAgent('bob')
      })

      it('When alice sends a message to bob by name', async () => {
        await createTestAgent('alice')
        await createTestAgent('bob')
        const msg = await sendToAgentByName('alice', 'bob', 'Hi Bob!')
        expect(msg).toBeDefined()
      })

      it('Then bob should receive the message', async () => {
        await createTestAgent('alice')
        await createTestAgent('bob')
        await sendToAgentByName('alice', 'bob', 'Hi Bob!')

        const inbox = await checkInboxByName('bob')
        expect(inbox.length).toBe(1)
        expect(inbox[0]!.message).toBe('Hi Bob!')
      })
    })

    describe('Scenario: Send response message', () => {
      it('Given a request message exists from alice to bob', async () => {
        await createTestAgent('alice')
        await createTestAgent('bob')
        await sendToAgentByName('alice', 'bob', 'What is 2+2?', 'request')
      })

      it('When bob sends a response back to alice', async () => {
        await createTestAgent('alice')
        await createTestAgent('bob')
        await sendToAgentByName('alice', 'bob', 'What is 2+2?', 'request')
        const response = await sendToAgentByName('bob', 'alice', 'The answer is 4', 'response')

        expect(response.messageType).toBe('response')
      })

      it('Then alice should receive a response type message', async () => {
        await createTestAgent('alice')
        await createTestAgent('bob')
        await sendToAgentByName('alice', 'bob', 'What is 2+2?', 'request')
        await sendToAgentByName('bob', 'alice', 'The answer is 4', 'response')

        const inbox = await checkInboxByName('alice')
        expect(inbox.length).toBe(1)
        expect(inbox[0]!.messageType).toBe('response')
      })
    })

    describe('Scenario: Fail to send message to non-existent agent', () => {
      it('Given only agent "sender" exists', async () => {
        await createTestAgent('sender')
      })

      it('When sender tries to send to non-existent "ghost"', async () => {
        await createTestAgent('sender')
        await expect(sendToAgentByName('sender', 'ghost', 'Hello?')).rejects.toThrow(
          'Agent not found: ghost',
        )
      })
    })

    describe('Scenario: Fail to send message from non-existent agent', () => {
      it('Given only agent "receiver" exists', async () => {
        await createTestAgent('receiver')
      })

      it('When non-existent "ghost" tries to send message', async () => {
        await createTestAgent('receiver')
        await expect(sendToAgentByName('ghost', 'receiver', 'Hello!')).rejects.toThrow(
          'Agent not found: ghost',
        )
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Check Inbox
  // ----------------------------------------------------------
  describe('Feature: Check Inbox', () => {
    describe('Scenario: Check inbox with pending messages', () => {
      it('Given agent "receiver" has 3 pending messages', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        await sendToAgent(sender.id, receiver.id, 'Message 1')
        await sendToAgent(sender.id, receiver.id, 'Message 2')
        await sendToAgent(sender.id, receiver.id, 'Message 3')
      })

      it('When receiver checks their inbox', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        await sendToAgent(sender.id, receiver.id, 'Message 1')
        await sendToAgent(sender.id, receiver.id, 'Message 2')
        await sendToAgent(sender.id, receiver.id, 'Message 3')

        const inbox = await checkInbox(receiver.id)
        expect(inbox.length).toBe(3)
      })

      it('Then all pending messages should be returned', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        await sendToAgent(sender.id, receiver.id, 'Message 1')
        await sendToAgent(sender.id, receiver.id, 'Message 2')
        await sendToAgent(sender.id, receiver.id, 'Message 3')

        const inbox = await checkInbox(receiver.id)
        const messages = inbox.map(m => m.message)

        expect(messages).toContain('Message 1')
        expect(messages).toContain('Message 2')
        expect(messages).toContain('Message 3')
      })
    })

    describe('Scenario: Check empty inbox', () => {
      it('Given agent "lonely" has no messages', async () => {
        await createTestAgent('lonely')
      })

      it('When lonely checks their inbox', async () => {
        const lonely = await createTestAgent('lonely')
        const inbox = await checkInbox(lonely.id)
        expect(inbox.length).toBe(0)
      })

      it('Then an empty list should be returned', async () => {
        const lonely = await createTestAgent('lonely')
        const inbox = await checkInbox(lonely.id)
        expect(inbox).toEqual([])
      })
    })

    describe('Scenario: Check inbox excludes read messages', () => {
      it('Given some messages have been read', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        const msg1 = await sendToAgent(sender.id, receiver.id, 'Old message')
        await sendToAgent(sender.id, receiver.id, 'New message')

        await markInboxRead([msg1.id])
      })

      it('When receiver checks their inbox', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        const msg1 = await sendToAgent(sender.id, receiver.id, 'Old message')
        await sendToAgent(sender.id, receiver.id, 'New message')
        await markInboxRead([msg1.id])

        const inbox = await checkInbox(receiver.id)
        expect(inbox.length).toBe(1)
      })

      it('Then only pending messages should be returned', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        const msg1 = await sendToAgent(sender.id, receiver.id, 'Old message')
        await sendToAgent(sender.id, receiver.id, 'New message')
        await markInboxRead([msg1.id])

        const inbox = await checkInbox(receiver.id)
        expect(inbox[0]!.message).toBe('New message')
      })
    })

    describe('Scenario: Check inbox by agent name for non-existent agent', () => {
      it('Given no agent "nobody" exists', async () => {
        // No setup needed
      })

      it('When checking inbox for "nobody"', async () => {
        const inbox = await checkInboxByName('nobody')
        expect(inbox.length).toBe(0)
      })

      it('Then an empty list should be returned', async () => {
        const inbox = await checkInboxByName('nobody')
        expect(inbox).toEqual([])
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Mark Messages as Read
  // ----------------------------------------------------------
  describe('Feature: Mark Messages as Read', () => {
    describe('Scenario: Mark single message as read', () => {
      it('Given a pending message exists', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Please read me')
        expect(msg.status).toBe('pending')
      })

      it('When the message is marked as read', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Please read me')

        await markInboxRead([msg.id])
      })

      it('Then the message status should be "read"', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Please read me')
        await markInboxRead([msg.id])

        const updated = await db.select().from(agentInbox).where(eq(agentInbox.id, msg.id)).get()
        expect(updated?.status).toBe('read')
      })

      it('And the read timestamp should be set', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Please read me')

        const before = new Date()
        await markInboxRead([msg.id])

        const updated = await db.select().from(agentInbox).where(eq(agentInbox.id, msg.id)).get()
        expect(updated?.readAt).toBeDefined()
        expect(updated!.readAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
      })
    })

    describe('Scenario: Mark multiple messages as read', () => {
      it('Given multiple pending messages exist', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        await sendToAgent(sender.id, receiver.id, 'Message 1')
        await sendToAgent(sender.id, receiver.id, 'Message 2')
        await sendToAgent(sender.id, receiver.id, 'Message 3')
      })

      it('When all messages are marked as read', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        const msg1 = await sendToAgent(sender.id, receiver.id, 'Message 1')
        const msg2 = await sendToAgent(sender.id, receiver.id, 'Message 2')
        const msg3 = await sendToAgent(sender.id, receiver.id, 'Message 3')

        await markInboxRead([msg1.id, msg2.id, msg3.id])
      })

      it('Then all messages should have read status', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        const msg1 = await sendToAgent(sender.id, receiver.id, 'Message 1')
        const msg2 = await sendToAgent(sender.id, receiver.id, 'Message 2')
        const msg3 = await sendToAgent(sender.id, receiver.id, 'Message 3')

        await markInboxRead([msg1.id, msg2.id, msg3.id])

        const inbox = await checkInbox(receiver.id)
        expect(inbox.length).toBe(0) // No pending messages

        const history = await getInboxHistory(receiver.id)
        expect(history.every(m => m.status === 'read')).toBe(true)
      })
    })

    describe('Scenario: Mark empty list does nothing', () => {
      it('Given no message IDs to mark', async () => {
        // Empty list
      })

      it('When marking empty list as read', async () => {
        await markInboxRead([])
        // Should not throw
      })

      it('Then no error should occur', async () => {
        await expect(markInboxRead([])).resolves.toBeUndefined()
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Archive Messages
  // ----------------------------------------------------------
  describe('Feature: Archive Messages', () => {
    describe('Scenario: Archive read messages', () => {
      it('Given a read message exists', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Archive me')
        await markInboxRead([msg.id])
      })

      it('When the message is archived', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Archive me')
        await markInboxRead([msg.id])
        await archiveInboxMessages([msg.id])
      })

      it('Then the message status should be "archived"', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')
        const msg = await sendToAgent(sender.id, receiver.id, 'Archive me')
        await markInboxRead([msg.id])
        await archiveInboxMessages([msg.id])

        const updated = await db.select().from(agentInbox).where(eq(agentInbox.id, msg.id)).get()
        expect(updated?.status).toBe('archived')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Get Message History
  // ----------------------------------------------------------
  describe('Feature: Get Message History', () => {
    describe('Scenario: Get inbox history includes all statuses', () => {
      it('Given messages with different statuses', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        await sendToAgent(sender.id, receiver.id, 'Pending')
        const msg2 = await sendToAgent(sender.id, receiver.id, 'Read')
        const msg3 = await sendToAgent(sender.id, receiver.id, 'Archived')

        await markInboxRead([msg2.id])
        await markInboxRead([msg3.id])
        await archiveInboxMessages([msg3.id])
      })

      it('When getting inbox history', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        await sendToAgent(sender.id, receiver.id, 'Pending')
        const msg2 = await sendToAgent(sender.id, receiver.id, 'Read')
        const msg3 = await sendToAgent(sender.id, receiver.id, 'Archived')

        await markInboxRead([msg2.id])
        await markInboxRead([msg3.id])
        await archiveInboxMessages([msg3.id])

        const history = await getInboxHistory(receiver.id)
        expect(history.length).toBe(3)
      })

      it('Then all messages should be included', async () => {
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

        expect(statuses).toContain('pending')
        expect(statuses).toContain('read')
        expect(statuses).toContain('archived')
      })
    })

    describe('Scenario: Get sent messages', () => {
      it('Given agent has sent multiple messages', async () => {
        const sender = await createTestAgent('sender')
        const receiver1 = await createTestAgent('receiver1')
        const receiver2 = await createTestAgent('receiver2')

        await sendToAgent(sender.id, receiver1.id, 'To receiver 1')
        await sendToAgent(sender.id, receiver2.id, 'To receiver 2')
      })

      it('When getting sent messages', async () => {
        const sender = await createTestAgent('sender')
        const receiver1 = await createTestAgent('receiver1')
        const receiver2 = await createTestAgent('receiver2')

        await sendToAgent(sender.id, receiver1.id, 'To receiver 1')
        await sendToAgent(sender.id, receiver2.id, 'To receiver 2')

        const sent = await getSentMessages(sender.id)
        expect(sent.length).toBe(2)
      })

      it('Then all sent messages should be returned', async () => {
        const sender = await createTestAgent('sender')
        const receiver1 = await createTestAgent('receiver1')
        const receiver2 = await createTestAgent('receiver2')

        await sendToAgent(sender.id, receiver1.id, 'To receiver 1')
        await sendToAgent(sender.id, receiver2.id, 'To receiver 2')

        const sent = await getSentMessages(sender.id)
        const messages = sent.map(m => m.message)

        expect(messages).toContain('To receiver 1')
        expect(messages).toContain('To receiver 2')
      })
    })

    describe('Scenario: History respects limit parameter', () => {
      it('Given more messages than the limit', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        for (let i = 0; i < 10; i++) {
          await sendToAgent(sender.id, receiver.id, `Message ${i}`)
        }
      })

      it('When getting history with limit of 5', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        for (let i = 0; i < 10; i++) {
          await sendToAgent(sender.id, receiver.id, `Message ${i}`)
        }

        const history = await getInboxHistory(receiver.id, 5)
        expect(history.length).toBe(5)
      })

      it('Then only the limited number should be returned', async () => {
        const sender = await createTestAgent('sender')
        const receiver = await createTestAgent('receiver')

        for (let i = 0; i < 10; i++) {
          await sendToAgent(sender.id, receiver.id, `Message ${i}`)
        }

        const history = await getInboxHistory(receiver.id, 3)
        expect(history.length).toBe(3)
      })
    })
  })
})
