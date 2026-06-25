import type { HarnessAdapter, HarnessContext, HarnessDetection, HarnessId, HarnessRegistry } from './types'

function createHarnessRegistry(): HarnessRegistry {
  const adapters: HarnessAdapter[] = []

  return {
    async detectAll(context?: HarnessContext): Promise<HarnessDetection[]> {
      return Promise.all(adapters.map(adapter => adapter.detect(context)))
    },

    list(): HarnessAdapter[] {
      return [...adapters]
    },

    async open(id: HarnessId, context?: HarnessContext) {
      const adapter = adapters.find(candidate => candidate.id === id)
      if (!adapter) {
        throw new Error(`Unknown harness adapter: ${id}`)
      }

      return adapter.open(context)
    },

    use(adapter: HarnessAdapter): void {
      if (adapters.some(candidate => candidate.id === adapter.id)) {
        throw new Error(`Duplicate harness adapter: ${adapter.id}`)
      }

      adapters.push(adapter)
    }
  }
}

export const harness = createHarnessRegistry()
