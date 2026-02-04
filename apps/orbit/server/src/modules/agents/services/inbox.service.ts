import { agents } from '@db/agents'
import { agentInbox, type AgentInboxMessage, type NewAgentInboxMessage } from '@db/inbox'
import { eq, and, inArray } from 'drizzle-orm'

import { db } from '@/core/db'

export async function sendToAgent(
  fromAgentId: number,
  toAgentId: number,
  message: string,
  messageType: 'request' | 'response' = 'request',
): Promise<AgentInboxMessage> {
  const newMessage: NewAgentInboxMessage = {
    fromAgentId,
    toAgentId,
    message,
    messageType,
    status: 'pending',
  }

  const result = await db.insert(agentInbox).values(newMessage).returning()
  return result[0]
}

export async function sendToAgentByName(
  fromAgentName: string,
  toAgentName: string,
  message: string,
  messageType: 'request' | 'response' = 'request',
): Promise<AgentInboxMessage> {
  const fromAgent = await db.select().from(agents).where(eq(agents.name, fromAgentName)).get()
  const toAgent = await db.select().from(agents).where(eq(agents.name, toAgentName)).get()

  if (!fromAgent) {
    throw new Error(`Agent not found: ${fromAgentName}`)
  }
  if (!toAgent) {
    throw new Error(`Agent not found: ${toAgentName}`)
  }

  return sendToAgent(fromAgent.id, toAgent.id, message, messageType)
}

export async function checkInbox(agentId: number): Promise<AgentInboxMessage[]> {
  return db
    .select()
    .from(agentInbox)
    .where(and(eq(agentInbox.toAgentId, agentId), eq(agentInbox.status, 'pending')))
    .all()
}

export async function checkInboxByName(agentName: string): Promise<AgentInboxMessage[]> {
  const agent = await db.select().from(agents).where(eq(agents.name, agentName)).get()
  if (!agent) {
    return []
  }
  return checkInbox(agent.id)
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

export async function getInboxHistory(agentId: number, limit = 50): Promise<AgentInboxMessage[]> {
  return db
    .select()
    .from(agentInbox)
    .where(eq(agentInbox.toAgentId, agentId))
    .orderBy(agentInbox.createdAt)
    .limit(limit)
    .all()
}

export async function getSentMessages(agentId: number, limit = 50): Promise<AgentInboxMessage[]> {
  return db
    .select()
    .from(agentInbox)
    .where(eq(agentInbox.fromAgentId, agentId))
    .orderBy(agentInbox.createdAt)
    .limit(limit)
    .all()
}
