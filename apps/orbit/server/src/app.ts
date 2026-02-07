import { API_ROUTES } from '@orbit/shared/constants'
import { logger } from '@plimeor-labs/logger'
import { Elysia } from 'elysia'

import { AgentPool, ensureOrbitDirs, getOrbitBasePath } from '@/modules/agent'
import { createAgentsController, createChatController } from '@/modules/chat'
import { corsPlugin } from '@/modules/plugins/cors'
import { swaggerPlugin } from '@/modules/plugins/swagger'
import { createSchedulerService } from '@/modules/scheduler'
import { AgentStore } from '@/stores/agent.store'
import { InboxStore } from '@/stores/inbox.store'
import { SessionStore } from '@/stores/session.store'
import { TaskStore } from '@/stores/task.store'

// Initialize stores
const basePath = getOrbitBasePath()
const agentStore = new AgentStore(basePath)
const taskStore = new TaskStore(basePath)
const inboxStore = new InboxStore(basePath)
const sessionStore = new SessionStore(basePath)

// Initialize agent pool
const agentPool = new AgentPool({
  basePath,
  agentStore,
  taskStore,
  inboxStore,
  sessionStore
})

// Initialize scheduler
const scheduler = createSchedulerService({ taskStore, agentPool })

// Build controllers
const chatController = createChatController({ agentPool, agentStore, sessionStore })
const agentsController = createAgentsController({ agentStore })

// Build app
const baseApp = new Elysia().use(corsPlugin)

export const app = (swaggerPlugin ? baseApp.use(swaggerPlugin) : baseApp)
  .use(chatController)
  .use(agentsController)
  .get(API_ROUTES.HEALTH, () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })
  .onStart(async () => {
    // Ensure orbit directories exist
    await ensureOrbitDirs()

    // Start agent pool eviction
    agentPool.startEviction()

    // Start scheduler
    scheduler.start()

    logger.info('Server started')
  })
  .onStop(() => {
    // Stop scheduler
    scheduler.stop()

    // Stop agent pool eviction
    agentPool.stopEviction()

    logger.info('Server stopped')
  })
