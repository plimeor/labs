import { logger as baseLogger } from '@plimeor-labs/logger'

export async function setupLogger() {
  await baseLogger.setup({
    name: 'orbit',
    level: 'debug',
  })
}

export const logger = {
  info: baseLogger.info.bind(baseLogger),
  warn: baseLogger.warn.bind(baseLogger),
  error: baseLogger.error.bind(baseLogger),
  debug: baseLogger.debug.bind(baseLogger),
}
