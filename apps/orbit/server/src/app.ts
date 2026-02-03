import { API_ROUTES } from '@orbit/shared/constants'
import { Elysia } from 'elysia'

import { logger } from './core/logger'
import { ensureOrbitDirs } from './modules/agents/services/workspace.service'
import { chatController, agentsController } from './modules/chat'
import { startScheduler, stopScheduler } from './modules/scheduler'
import { corsPlugin } from './plugins/cors'
import { swaggerPlugin } from './plugins/swagger'

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

    logger.info('Server started')
  })
  .onStop(() => {
    // Stop scheduler
    stopScheduler()

    logger.info('Server stopped')
  })
