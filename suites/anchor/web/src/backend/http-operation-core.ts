import type { AnchorBackend } from '../domain/types'
import { commandMap } from './index'

// Base URL for the anchor-core HTTP bridge.
// In web/dev builds the Vite proxy rewrites '/anchor-core' → 'http://127.0.0.1:4317'.
// Override with VITE_ANCHOR_CORE_URL for custom setups (e.g. integration tests
// that start the server on a random port). import.meta.env is injected by Vite
// and is absent in the Bun test runner, so we guard with typeof checks.
function resolveBase(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const url = (import.meta as any).env?.VITE_ANCHOR_CORE_URL as string | undefined
    if (url) return url
  } catch {}
  // Fall back to the process env (used by integration tests)
  if (typeof process !== 'undefined' && process.env.VITE_ANCHOR_CORE_URL) {
    return process.env.VITE_ANCHOR_CORE_URL
  }
  return '/anchor-core'
}

const BASE = resolveBase()

function call<TKey extends keyof AnchorBackend>(
  key: TKey,
  payload?: Record<string, unknown>
): Promise<Awaited<ReturnType<AnchorBackend[TKey]>>> {
  const op = commandMap[key]
  return fetch(`${BASE}/rpc`, {
    body: JSON.stringify({ args: payload ?? {}, op }),
    headers: { 'content-type': 'application/json' },
    method: 'POST'
  })
    .then(response => response.json())
    .then(json => {
      if (json && typeof json === 'object' && 'error' in json) {
        const { code, message } = json.error as { code: string; message: string }
        throw new Error(`${code}: ${message}`)
      }
      return json as Awaited<ReturnType<AnchorBackend[TKey]>>
    })
}

export function createHttpAnchorBackend(): AnchorBackend {
  return {
    applyProposedChange: id => call('applyProposedChange', { id }),
    createAgentTask: input => call('createAgentTask', { ...input }),
    createNote: input => call('createNote', { ...input }),
    createProposedChange: input => call('createProposedChange', { ...input }),
    diagnostics: () => call('diagnostics'),
    getBacklinks: noteId => call('getBacklinks', { noteId }),
    getGraphNeighborhood: (noteId, depth) => call('getGraphNeighborhood', { depth, noteId }),
    getLinks: noteId => call('getLinks', { noteId }),
    getObjectTypes: () => call('getObjectTypes'),
    getProposedChanges: () => call('getProposedChanges'),
    getUnlinkedMentions: noteId => call('getUnlinkedMentions', { noteId }),
    listAgentConnections: () => call('listAgentConnections'),
    listAgentTasks: () => call('listAgentTasks'),
    listNotes: () => call('listNotes'),
    listOperationRecords: () => call('listOperationRecords'),
    openDemoVault: () => call('openDemoVault'),
    openTodayJournal: () => call('openTodayJournal'),
    // openVault over HTTP: calls open_vault with a path arg (no native dialog).
    // Returns diagnostics on success; returns undefined (satisfying AnchorBackend)
    // when no path is provided (caller can prompt the user separately).
    openVault: () => {
      const path = typeof window !== 'undefined' ? (window.prompt('Vault path:') ?? '') : ''
      if (!path) {
        return Promise.resolve(undefined)
      }
      return call('openVault', { path })
    },
    readNote: noteId => call('readNote', { noteId }),
    rejectProposedChange: id => call('rejectProposedChange', { id }),
    searchNotes: request => call('searchNotes', { request }),
    setTaskPermissionMode: (taskId, mode) => call('setTaskPermissionMode', { mode, taskId }),
    updateNote: input => call('updateNote', { ...input })
  }
}
