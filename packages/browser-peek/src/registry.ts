import { chromeAdapter } from './chrome'
import { safariAdapter } from './safari'
import { type BrowserAdapter, type BrowserId, BrowserPeekError } from './types'

const adapters: Record<BrowserId, BrowserAdapter> = {
  chrome: chromeAdapter,
  safari: safariAdapter
}

export const BROWSER_IDS = Object.keys(adapters) as BrowserId[]

export function getAdapter(id: BrowserId): BrowserAdapter {
  const adapter = adapters[id]
  if (!adapter) {
    throw new BrowserPeekError(`Unsupported browser: ${id}. Supported: ${BROWSER_IDS.join(', ')}.`)
  }
  return adapter
}
