import { API_ROUTES } from '@orbit/shared/constants'
import { logger } from '@plimeor-labs/logger'
import { Elysia } from 'elysia'

import { syncAgentsWithWorkspaces } from './modules/agents/services/agent.service'
import { ensureOrbitDirs } from './modules/agents/services/workspace.service'
import { chatController, agentsController } from './modules/chat'
import { corsPlugin } from './modules/plugins/cors'
import { swaggerPlugin } from './modules/plugins/swagger'
import { startScheduler, stopScheduler } from './modules/scheduler'

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

    // Start scheduler
    startScheduler()

    // Sync agents with workspaces (non-blocking)
    setImmediate(() => {
      syncAgentsWithWorkspaces().catch(err => {
        logger.error('Failed to sync agents with workspaces', { error: err })
      })
    })

    logger.info('Server started')
  })
  .onStop(() => {
    // Stop scheduler
    stopScheduler()

    logger.info('Server stopped')
  })
