import {
  type Logger as LogTapeLogger,
  ansiColorFormatter,
  configure,
  defaultTextFormatter,
  getConsoleSink,
  getLogger,
} from '@logtape/logtape'

type Level = 'debug' | 'info' | 'warning' | 'error'

interface SetupOptions {
  name: string
  level?: Level
  pretty?: boolean
}

let rootCategory: string | null = null

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
  },

  child(...names: string[]): LogTapeLogger {
    if (!rootCategory) {
      throw new Error('Logger not initialized. Call logger.setup() first.')
    }
    return getLogger([rootCategory, ...names])
  },
}

export type { LogTapeLogger as Logger }
