import { isValidAgentName } from '@orbit/shared/utils'
import { logger } from '@plimeor-labs/logger'
import { Elysia, sse, t } from 'elysia'

import type { AgentPool } from '@/modules/agent'
import type { AgentStore } from '@/stores/agent.store'
import type { InboxStore } from '@/stores/inbox.store'
import type { SessionStore } from '@/stores/session.store'
import type { TaskStore } from '@/stores/task.store'
import { calculateNextRun } from '@/utils/schedule'
import { extractResultText } from '@/utils/sdk'
import { resolveOrCreateSession } from '@/utils/session'

export function createChatController(deps: {
  agentPool: AgentPool
  agentStore: AgentStore
  sessionStore: SessionStore
}) {
  const { agentPool, agentStore, sessionStore } = deps

  return (
    new Elysia({ prefix: '/api/chat' })
      // SSE streaming chat endpoint
      .post(
        '/',
        async function* ({ body, set }) {
          const { agentName, message, sessionId, model } = body

          if (!isValidAgentName(agentName)) {
            set.status = 400
            return
          }

          logger.info('Chat request received', { agentName, sessionId })

          const session = await resolveOrCreateSession(agentStore, sessionStore, agentName, sessionId)
          if (!session) {
            set.status = 404
            return
          }

          // Get agent instance for this session
          const agent = await agentPool.get(agentName, session.id)

          try {
            yield sse({ data: { type: 'system', session_id: session.id } })

            // Stream agent responses
            let resultText = ''
            for await (const msg of agent.chat(message, {
              sessionType: 'chat',
              sessionId: session.id,
              model
            })) {
              yield sse({ data: { type: msg.type, ...(msg as Record<string, unknown>) } })

              const text = extractResultText(msg)
              if (text !== undefined) resultText = text
            }

            // Store messages
            await sessionStore.appendConversation(agentName, session.id, message, resultText)
          } catch (error) {
            logger.error('Chat stream error', { error, agentName })
            yield sse({
              data: {
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error'
              }
            })
          }
        },
        {
          body: t.Object({
            agentName: t.String(),
            message: t.String(),
            sessionId: t.Optional(t.String()),
            model: t.Optional(t.String())
          })
        }
      )

      // Legacy non-streaming endpoint (backward compatibility)
      .post(
        '/sync',
        async ({ body, set }) => {
          const { agentName, message, sessionId, model } = body

          if (!isValidAgentName(agentName)) {
            set.status = 400
            return { error: 'Invalid agent name' }
          }

          const session = await resolveOrCreateSession(agentStore, sessionStore, agentName, sessionId)
          if (!session) {
            set.status = 404
            return { error: `Session not found: ${sessionId}` }
          }

          const agent = await agentPool.get(agentName, session.id)

          let result = ''
          for await (const msg of agent.chat(message, {
            sessionType: 'chat',
            sessionId: session.id,
            model
          })) {
            const text = extractResultText(msg)
            if (text !== undefined) result = text
          }

          await sessionStore.appendConversation(agentName, session.id, message, result)

          return { response: result, sessionId: session.id }
        },
        {
          body: t.Object({
            agentName: t.String(),
            message: t.String(),
            sessionId: t.Optional(t.String()),
            model: t.Optional(t.String())
          })
        }
      )

      // Get chat history
      .get(
        '/history/:sessionId',
        async ({ params }) => {
          const agents = await agentStore.list()
          for (const agent of agents) {
            const session = await sessionStore.get(agent.name, params.sessionId)
            if (session) {
              const msgs = await sessionStore.getMessages(agent.name, params.sessionId)
              return {
                session: {
                  id: session.id,
                  createdAt: session.createdAt,
                  messageCount: session.messageCount
                },
                messages: msgs.map(m => ({
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp
                }))
              }
            }
          }
          return { messages: [] }
        },
        {
          params: t.Object({ sessionId: t.String() })
        }
      )
  )
}

export function createAgentsController(deps: { agentStore: AgentStore }) {
  const { agentStore } = deps

  return new Elysia({ prefix: '/api/agents' })
    .get('/', async () => {
      const agents = await agentStore.list()
      return { agents }
    })
    .post(
      '/',
      async ({ body, set }) => {
        if (!isValidAgentName(body.name)) {
          set.status = 400
          return { error: 'Invalid agent name. Only alphanumeric, hyphens, and underscores allowed.' }
        }
        const agent = await agentStore.create(body)
        return { agent }
      },
      {
        body: t.Object({
          name: t.String(),
          description: t.Optional(t.String())
        })
      }
    )
    .get(
      '/:name',
      async ({ params, set }) => {
        const agent = await agentStore.get(params.name)
        if (!agent) {
          set.status = 404
          return { error: 'Agent not found' }
        }
        return { agent }
      },
      {
        params: t.Object({ name: t.String() })
      }
    )
    .put(
      '/:name',
      async ({ params, body }) => {
        const agent = await agentStore.update(params.name, body)
        return { agent }
      },
      {
        params: t.Object({ name: t.String() }),
        body: t.Object({
          description: t.Optional(t.String()),
          model: t.Optional(t.String()),
          permissionMode: t.Optional(t.Union([t.Literal('safe'), t.Literal('ask'), t.Literal('allow-all')])),
          status: t.Optional(t.Union([t.Literal('active'), t.Literal('inactive')]))
        })
      }
    )
    .delete(
      '/:name',
      async ({ params }) => {
        await agentStore.delete(params.name)
        return { success: true }
      },
      {
        params: t.Object({ name: t.String() })
      }
    )
}

export function createSessionsController(deps: { sessionStore: SessionStore; agentStore: AgentStore }) {
  const { sessionStore, agentStore } = deps

  return new Elysia({ prefix: '/api/agents' })
    .post(
      '/:name/sessions',
      async ({ params, body }) => {
        await agentStore.ensure(params.name)
        const session = await sessionStore.create(params.name, body ?? {})
        return { session }
      },
      {
        params: t.Object({ name: t.String() }),
        body: t.Optional(
          t.Object({
            title: t.Optional(t.String()),
            model: t.Optional(t.String())
          })
        )
      }
    )
    .get(
      '/:name/sessions',
      async ({ params }) => {
        const sessions = await sessionStore.listByAgent(params.name)
        return { sessions }
      },
      {
        params: t.Object({ name: t.String() })
      }
    )
    .get(
      '/:name/sessions/:id',
      async ({ params, set }) => {
        const session = await sessionStore.get(params.name, params.id)
        if (!session) {
          set.status = 404
          return { error: 'Session not found' }
        }
        const messages = await sessionStore.getMessages(params.name, params.id)
        return { session, messages }
      },
      {
        params: t.Object({ name: t.String(), id: t.String() })
      }
    )
    .put(
      '/:name/sessions/:id',
      async ({ params, body }) => {
        const session = await sessionStore.update(params.name, params.id, body)
        return { session }
      },
      {
        params: t.Object({ name: t.String(), id: t.String() }),
        body: t.Object({
          title: t.Optional(t.String())
        })
      }
    )
    .delete(
      '/:name/sessions/:id',
      async ({ params }) => {
        await sessionStore.delete(params.name, params.id)
        return { success: true }
      },
      {
        params: t.Object({ name: t.String(), id: t.String() })
      }
    )
}

export function createInboxController(deps: { inboxStore: InboxStore }) {
  const { inboxStore } = deps

  return new Elysia({ prefix: '/api/agents' })
    .get(
      '/:name/inbox',
      async ({ params }) => {
        const messages = await inboxStore.getPending(params.name)
        return { messages }
      },
      {
        params: t.Object({ name: t.String() })
      }
    )
    .delete(
      '/:name/inbox/:msgId',
      async ({ params }) => {
        await inboxStore.markRead(params.name, [params.msgId])
        return { success: true }
      },
      {
        params: t.Object({ name: t.String(), msgId: t.String() })
      }
    )
}

export function createTasksController(deps: { taskStore: TaskStore }) {
  const { taskStore } = deps

  return new Elysia()
    .get('/api/tasks', async () => {
      const allTasks = await taskStore.findAllTasks()
      return { tasks: allTasks }
    })
    .get(
      '/api/agents/:name/tasks',
      async ({ params }) => {
        const tasks = await taskStore.listByAgent(params.name)
        return { tasks }
      },
      {
        params: t.Object({ name: t.String() })
      }
    )
    .post(
      '/api/agents/:name/tasks',
      async ({ params, body, set }) => {
        // Validate schedule value
        const nextRun = calculateNextRun(body.scheduleType, body.scheduleValue)
        if (!nextRun) {
          set.status = 400
          return { error: 'Invalid schedule value. Could not calculate next run time.' }
        }

        const task = await taskStore.create(params.name, { ...body, nextRun })
        return { task }
      },
      {
        params: t.Object({ name: t.String() }),
        body: t.Object({
          prompt: t.String(),
          scheduleType: t.Union([t.Literal('cron'), t.Literal('interval'), t.Literal('once')]),
          scheduleValue: t.String(),
          contextMode: t.Union([t.Literal('isolated'), t.Literal('main')]),
          name: t.Optional(t.String())
        })
      }
    )
    .put(
      '/api/agents/:name/tasks/:id',
      async ({ params, body, set }) => {
        const existing = await taskStore.get(params.name, params.id)
        if (!existing) {
          set.status = 404
          return { error: 'Task not found' }
        }

        // Recalculate nextRun when resuming a task
        const updates: Record<string, unknown> = { ...body }
        if (body.status === 'active' && existing.status === 'paused') {
          updates.nextRun = calculateNextRun(existing.scheduleType, existing.scheduleValue) ?? null
        }

        const task = await taskStore.update(params.name, params.id, updates)
        return { task }
      },
      {
        params: t.Object({ name: t.String(), id: t.String() }),
        body: t.Object({
          status: t.Optional(t.Union([t.Literal('active'), t.Literal('paused')])),
          prompt: t.Optional(t.String()),
          name: t.Optional(t.String())
        })
      }
    )
    .delete(
      '/api/agents/:name/tasks/:id',
      async ({ params }) => {
        await taskStore.delete(params.name, params.id)
        return { success: true }
      },
      {
        params: t.Object({ name: t.String(), id: t.String() })
      }
    )
}
