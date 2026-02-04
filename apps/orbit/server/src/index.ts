import { logger } from '@plimeor-labs/logger'

import { app } from './app.js'
import { env } from './core/env.js'

await logger.setup({ name: 'orbit', level: 'debug' })

app.listen(env.PORT)

logger.info(`Server running at http://localhost:${env.PORT}`)
logger.info(`API docs at http://localhost:${env.PORT}/swagger`)
