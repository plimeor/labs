export type PermissionMode = 'safe' | 'ask' | 'allow-all'

interface HookInput {
  toolName: string
  toolInput: Record<string, unknown>
}

interface HookResult {
  decision: 'allow' | 'deny'
  reason?: string
}

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TaskList', 'TaskGet'])

export function createPermissionHook(mode: PermissionMode): (input: HookInput) => HookResult {
  return (input: HookInput): HookResult => {
    if (mode === 'allow-all') {
      return { decision: 'allow' }
    }

    // MCP tools (orbit-tools, memory-tools) are always allowed
    if (input.toolName.startsWith('mcp__orbit-tools__') || input.toolName.startsWith('mcp__memory-tools__')) {
      return { decision: 'allow' }
    }

    if (mode === 'safe') {
      if (READ_ONLY_TOOLS.has(input.toolName)) {
        return { decision: 'allow' }
      }
      return { decision: 'deny', reason: 'Safe mode: write operations not allowed' }
    }

    // Ask mode: allow for now (SSE permission request will be added later)
    return { decision: 'allow' }
  }
}
