import { app } from './app.js'
import { env } from './core/env.js'
import { logger } from './core/logger.js'

app.listen(env.PORT)

logger.info(`🚀 Server running at http://localhost:${env.PORT}`)
logger.info(`📚 API docs at http://localhost:${env.PORT}/swagger`)
