import { logger } from '@plimeor-labs/logger'
import { Elysia, t } from 'elysia'

import type { AgentPool } from '@/agent/agent-pool'
import type { AgentStore } from '@/stores/agent.store'
import type { SessionStore } from '@/stores/session.store'

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
        async ({ body, set }) => {
          const { agentName, message, sessionId, model } = body

          logger.info('Chat request received', { agentName, sessionId })

          // Ensure agent exists
          await agentStore.ensure(agentName)

          // Get or create agent instance
          const agent = await agentPool.get(agentName)

          // Create readable stream for SSE
          const stream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder()

              function sendEvent(type: string, data: unknown) {
                const payload = JSON.stringify({ type, ...(data as Record<string, unknown>) })
                controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
              }

              try {
                // Create session
                const session = await sessionStore.create(agentName, {})

                sendEvent('system', { session_id: session.id })

                // Stream agent responses
                let resultText = ''
                for await (const msg of agent.chat(message, {
                  sessionType: 'chat',
                  sessionId,
                  model,
                })) {
                  sendEvent(msg.type, msg)

                  if (msg.type === 'result') {
                    const resultMsg = msg as unknown as { result?: string }
                    resultText = resultMsg.result ?? ''
                  }
                }

                // Store messages
                await sessionStore.appendMessage(agentName, session.id, {
                  role: 'user',
                  content: message,
                })
                await sessionStore.appendMessage(agentName, session.id, {
                  role: 'assistant',
                  content: resultText,
                })
              } catch (error) {
                logger.error('Chat stream error', { error, agentName })
                sendEvent('error', {
                  message: error instanceof Error ? error.message : 'Unknown error',
                })
              } finally {
                controller.close()
              }
            },
          })

          set.headers['Content-Type'] = 'text/event-stream'
          set.headers['Cache-Control'] = 'no-cache'
          set.headers['Connection'] = 'keep-alive'

          return stream
        },
        {
          body: t.Object({
            agentName: t.String(),
            message: t.String(),
            sessionId: t.Optional(t.String()),
            model: t.Optional(t.String()),
          }),
        },
      )

      // Legacy non-streaming endpoint (backward compatibility)
      .post(
        '/sync',
        async ({ body }) => {
          const { agentName, message, sessionId, model } = body

          await agentStore.ensure(agentName)
          const agent = await agentPool.get(agentName)

          let result = ''
          for await (const msg of agent.chat(message, {
            sessionType: 'chat',
            sessionId,
            model,
          })) {
            if (msg.type === 'result') {
              const resultMsg = msg as unknown as { result?: string }
              result = resultMsg.result ?? ''
            }
          }

          const session = await sessionStore.create(agentName, {})
          await sessionStore.appendMessage(agentName, session.id, {
            role: 'user',
            content: message,
          })
          await sessionStore.appendMessage(agentName, session.id, {
            role: 'assistant',
            content: result,
          })

          return { response: result, sessionId: session.id }
        },
        {
          body: t.Object({
            agentName: t.String(),
            message: t.String(),
            sessionId: t.Optional(t.String()),
            model: t.Optional(t.String()),
          }),
        },
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
                  messageCount: session.messageCount,
                },
                messages: msgs.map(m => ({
                  role: m.role,
                  content: m.content,
                  timestamp: m.timestamp,
                })),
              }
            }
          }
          return { messages: [] }
        },
        {
          params: t.Object({ sessionId: t.String() }),
        },
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
      async ({ body }) => {
        const agent = await agentStore.create(body)
        return { agent }
      },
      {
        body: t.Object({
          name: t.String(),
          description: t.Optional(t.String()),
        }),
      },
    )
    .get(
      '/:name',
      async ({ params }) => {
        const agent = await agentStore.get(params.name)
        if (!agent) return { error: 'Agent not found' }
        return { agent }
      },
      {
        params: t.Object({ name: t.String() }),
      },
    )
    .delete(
      '/:name',
      async ({ params }) => {
        await agentStore.delete(params.name)
        return { success: true }
      },
      {
        params: t.Object({ name: t.String() }),
      },
    )
}
