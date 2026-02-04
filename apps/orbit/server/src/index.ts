import { app } from './app.js'
import { env } from './core/env.js'
import { logger, setupLogger } from './core/logger.js'

await setupLogger()

app.listen(env.PORT)

logger.info(`Server running at http://localhost:${env.PORT}`)
logger.info(`API docs at http://localhost:${env.PORT}/swagger`)
