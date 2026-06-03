import type { AnchorBackend } from '../domain/types'
import { createHttpAnchorBackend } from './http-operation-core'

type CommandName =
  | 'apply_proposed_change'
  | 'create_agent_task'
  | 'create_note'
  | 'create_proposed_change'
  | 'diagnostics'
  | 'get_backlinks'
  | 'get_graph_neighborhood'
  | 'get_links'
  | 'get_object_types'
  | 'get_proposed_changes'
  | 'get_unlinked_mentions'
  | 'list_agent_connections'
  | 'list_agent_tasks'
  | 'list_notes'
  | 'list_operation_records'
  | 'open_demo_vault'
  | 'open_vault'
  | 'open_today_journal'
  | 'read_note'
  | 'reject_proposed_change'
  | 'search_notes'
  | 'set_task_permission_mode'
  | 'update_note'

// Exported so http-operation-core.ts can share the same name mapping without
// duplicating it. Both Tauri and HTTP transports use the identical snake_case
// command names exposed by the Rust core.
export const commandMap = {
  applyProposedChange: 'apply_proposed_change',
  createAgentTask: 'create_agent_task',
  createNote: 'create_note',
  createProposedChange: 'create_proposed_change',
  diagnostics: 'diagnostics',
  getBacklinks: 'get_backlinks',
  getGraphNeighborhood: 'get_graph_neighborhood',
  getLinks: 'get_links',
  getObjectTypes: 'get_object_types',
  getProposedChanges: 'get_proposed_changes',
  getUnlinkedMentions: 'get_unlinked_mentions',
  listAgentConnections: 'list_agent_connections',
  listAgentTasks: 'list_agent_tasks',
  listNotes: 'list_notes',
  listOperationRecords: 'list_operation_records',
  openDemoVault: 'open_demo_vault',
  openTodayJournal: 'open_today_journal',
  openVault: 'open_vault',
  readNote: 'read_note',
  rejectProposedChange: 'reject_proposed_change',
  searchNotes: 'search_notes',
  setTaskPermissionMode: 'set_task_permission_mode',
  updateNote: 'update_note'
} satisfies Record<keyof AnchorBackend, CommandName>

export function createAnchorBackend(): AnchorBackend {
  if (isTauriRuntime()) {
    return createTauriBackend()
  }

  // Web/dev build: talk to `anchor-core serve` over HTTP.
  // The Vite dev server proxies /anchor-core → http://127.0.0.1:4317.
  return createHttpAnchorBackend()
}

function createTauriBackend(): AnchorBackend {
  return {
    applyProposedChange: id => call('applyProposedChange', { id }),
    createAgentTask: input => call('createAgentTask', { input }),
    createNote: input => call('createNote', { input }),
    createProposedChange: input => call('createProposedChange', { input }),
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
    openVault: async () => {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const path = await open({ directory: true, multiple: false, title: 'Open Anchor vault' })
      if (typeof path !== 'string') {
        return undefined
      }

      return call('openVault', { path })
    },
    readNote: noteId => call('readNote', { noteId }),
    rejectProposedChange: id => call('rejectProposedChange', { id }),
    searchNotes: request => call('searchNotes', { request }),
    setTaskPermissionMode: (taskId, mode) => call('setTaskPermissionMode', { mode, taskId }),
    updateNote: input => call('updateNote', { input })
  }
}

function call<TKey extends keyof AnchorBackend>(
  key: TKey,
  payload?: Record<string, unknown>
): ReturnType<AnchorBackend[TKey]> {
  return import('@tauri-apps/api/core').then(({ invoke }) => invoke(commandMap[key], payload)) as ReturnType<
    AnchorBackend[TKey]
  >
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
