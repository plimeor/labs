import {
  type Logger as LogTapeLogger,
  ansiColorFormatter,
  configure,
  defaultTextFormatter,
  getConsoleSink,
  getLogger,
} from '@logtape/logtape'

type Level = 'debug' | 'info' | 'warn' | 'error'

interface SetupOptions {
  name: string
  level?: Level
  pretty?: boolean
}

interface QueuedLog {
  level: Level
  category: string[]
  message: string
  properties: Record<string, unknown>
}

let rootCategory: string | null = null
let isConfigured = false
const queue: QueuedLog[] = []

function log(
  level: Level,
  category: string[],
  message: string,
  properties: Record<string, unknown> = {},
) {
  if (!isConfigured) {
    queue.push({ level, category, message, properties })
    return
  }
  const instance = getLogger(category)
  instance[level](message, properties)
}

function flushQueue() {
  while (queue.length > 0) {
    const { level, category, message, properties } = queue.shift()!
    const fullCategory = rootCategory ? [rootCategory, ...category] : category
    const instance = getLogger(fullCategory)
    instance[level](message, properties)
  }
}

export const logger = {
  async setup(options: SetupOptions) {
    const { name, level = 'debug', pretty = process.env.NODE_ENV !== 'production' } = options

    rootCategory = name

    await configure({
      sinks: {
        console: getConsoleSink({
          formatter: pretty ? ansiColorFormatter : defaultTextFormatter,
        }),
      },
      loggers: [{ category: [name], lowestLevel: level, sinks: ['console'] }],
    })

    isConfigured = true
    flushQueue()
  },

  child(...names: string[]): LogTapeLogger {
    if (!rootCategory) {
      throw new Error('Logger not initialized. Call logger.setup() first.')
    }
    return getLogger([rootCategory, ...names])
  },

  debug(message: string, properties?: Record<string, unknown>) {
    log('debug', [], message, properties)
  },

  info(message: string, properties?: Record<string, unknown>) {
    log('info', [], message, properties)
  },

  warning(message: string, properties?: Record<string, unknown>) {
    log('warning', [], message, properties)
  },

  error(message: string, properties?: Record<string, unknown>) {
    log('error', [], message, properties)
  },
}

export type { LogTapeLogger as Logger }
