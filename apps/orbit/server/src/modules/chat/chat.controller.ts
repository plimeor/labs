import { chatSessions, messages } from '@db/sessions'
import { logger } from '@plimeor-labs/logger'
import { eq } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import { db } from '@/core/db'

import { ensureAgent, listAgents } from '../agents/services/agent.service'
import { executeAgent } from '../agents/services/runtime.service'

export const chatController = new Elysia({ prefix: '/api/chat' })
  // Send a message to an agent
  .post(
    '/',
    async ({ body }) => {
      const { agentName, message, sessionId } = body

      logger.info('Chat request received', { agentName, sessionId })

      // Ensure agent exists (creates if not)
      const agent = await ensureAgent(agentName)

      // Execute agent
      const result = await executeAgent({
        agentName,
        prompt: message,
        sessionType: 'chat',
        sessionId,
      })

      // Store session and message
      let session = sessionId
        ? await db.select().from(chatSessions).where(eq(chatSessions.sessionId, sessionId)).get()
        : undefined

      if (!session) {
        const newSession = await db
          .insert(chatSessions)
          .values({
            agentId: agent.id,
            sessionId: result.sessionId,
          })
          .returning()
        session = newSession[0]!
      }

      // Store user message
      await db.insert(messages).values({
        sessionId: session.id,
        agentId: agent.id,
        role: 'user',
        content: message,
      })

      // Store assistant message
      await db.insert(messages).values({
        sessionId: session.id,
        agentId: agent.id,
        role: 'assistant',
        content: result.result,
      })

      // Update session
      await db
        .update(chatSessions)
        .set({
          lastMessageAt: new Date(),
          messageCount: session.messageCount + 2,
        })
        .where(eq(chatSessions.id, session.id))

      return {
        response: result.result,
        sessionId: result.sessionId,
      }
    },
    {
      body: t.Object({
        agentName: t.String(),
        message: t.String(),
        sessionId: t.Optional(t.String()),
      }),
    },
  )

  // Get chat history for a session
  .get(
    '/history/:sessionId',
    async ({ params }) => {
      const session = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.sessionId, params.sessionId))
        .get()

      if (!session) {
        return { messages: [] }
      }

      const history = await db
        .select()
        .from(messages)
        .where(eq(messages.sessionId, session.id))
        .orderBy(messages.timestamp)
        .all()

      return {
        session: {
          id: session.sessionId,
          agentId: session.agentId,
          createdAt: session.createdAt,
          messageCount: session.messageCount,
        },
        messages: history.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
      }
    },
    {
      params: t.Object({
        sessionId: t.String(),
      }),
    },
  )

  // List all sessions for an agent
  .get(
    '/sessions/:agentId',
    async ({ params }) => {
      const agentId = parseInt(params.agentId, 10)
      const sessions = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.agentId, agentId))
        .orderBy(chatSessions.createdAt)
        .all()

      return {
        sessions: sessions.map(s => ({
          id: s.sessionId,
          createdAt: s.createdAt,
          lastMessageAt: s.lastMessageAt,
          messageCount: s.messageCount,
        })),
      }
    },
    {
      params: t.Object({
        agentId: t.String(),
      }),
    },
  )

export const agentsController = new Elysia({ prefix: '/api/agents' })
  // List all agents
  .get('/', async () => {
    const agentList = await listAgents()
    return {
      agents: agentList.map(a => ({
        id: a.id,
        name: a.name,
        status: a.status,
        lastActiveAt: a.lastActiveAt,
        createdAt: a.createdAt,
      })),
    }
  })

  // Create a new agent
  .post(
    '/',
    async ({ body }) => {
      const { createAgent } = await import('../agents/services/agent.service')
      const agent = await createAgent(body)
      return {
        agent: {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          createdAt: agent.createdAt,
        },
      }
    },
    {
      body: t.Object({
        name: t.String(),
        description: t.Optional(t.String()),
      }),
    },
  )

  // Get agent details
  .get(
    '/:name',
    async ({ params }) => {
      const { getAgent } = await import('../agents/services/agent.service')
      const agent = await getAgent(params.name)

      if (!agent) {
        return { error: 'Agent not found' }
      }

      return {
        agent: {
          id: agent.id,
          name: agent.name,
          status: agent.status,
          lastActiveAt: agent.lastActiveAt,
          createdAt: agent.createdAt,
        },
      }
    },
    {
      params: t.Object({
        name: t.String(),
      }),
    },
  )

  // Delete an agent
  .delete(
    '/:name',
    async ({ params }) => {
      const { deleteAgent } = await import('../agents/services/agent.service')
      await deleteAgent(params.name)
      return { success: true }
    },
    {
      params: t.Object({
        name: t.String(),
      }),
    },
  )
