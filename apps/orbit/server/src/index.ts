import { logger } from '@plimeor-labs/logger'

import { app } from './app.js'
import { env } from './core/env.js'
import { checkQmdAvailability } from './modules/agent/services/qmd.service.js'

await logger.setup({ name: 'orbit', level: 'debug' })

// Check QMD availability at startup (result is cached)
await checkQmdAvailability()

app.listen(env.PORT)

logger.info(`Server running at http://localhost:${env.PORT}`)
logger.info(`API docs at http://localhost:${env.PORT}/swagger`)
