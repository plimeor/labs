import { eq, and, inArray } from 'drizzle-orm'

import {
  agentInbox,
  type AgentInboxMessage,
  type NewAgentInboxMessage,
} from '../../../../drizzle/schema/inbox'
import { db } from '../../../core/db/client'

export async function sendToAgent(
  fromAgent: string,
  toAgent: string,
  message: string,
  messageType: 'message' | 'request' | 'response' = 'message',
): Promise<AgentInboxMessage> {
  const newMessage: NewAgentInboxMessage = {
    fromAgent,
    toAgent,
    message,
    messageType,
    status: 'pending',
  }

  const result = await db.insert(agentInbox).values(newMessage).returning()
  return result[0]
}

export async function checkInbox(agentName: string): Promise<AgentInboxMessage[]> {
  return db
    .select()
    .from(agentInbox)
    .where(and(eq(agentInbox.toAgent, agentName), eq(agentInbox.status, 'pending')))
    .all()
}

export async function markInboxRead(messageIds: number[]): Promise<void> {
  if (messageIds.length === 0) return

  await db
    .update(agentInbox)
    .set({ status: 'read', readAt: new Date() })
    .where(inArray(agentInbox.id, messageIds))
}

export async function archiveInboxMessages(messageIds: number[]): Promise<void> {
  if (messageIds.length === 0) return

  await db.update(agentInbox).set({ status: 'archived' }).where(inArray(agentInbox.id, messageIds))
}

export async function getInboxHistory(agentName: string, limit = 50): Promise<AgentInboxMessage[]> {
  return db
    .select()
    .from(agentInbox)
    .where(eq(agentInbox.toAgent, agentName))
    .orderBy(agentInbox.createdAt)
    .limit(limit)
    .all()
}

export async function getSentMessages(agentName: string, limit = 50): Promise<AgentInboxMessage[]> {
  return db
    .select()
    .from(agentInbox)
    .where(eq(agentInbox.fromAgent, agentName))
    .orderBy(agentInbox.createdAt)
    .limit(limit)
    .all()
}
