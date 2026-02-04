import type Anthropic from '@anthropic-ai/sdk'

import * as qmd from '../services/qmd.service'

// Tool definitions for Anthropic API
export const memoryToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'search_memory',
    description:
      'Search your memories and notes using hybrid search (BM25 + vector + LLM reranking).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for',
        },
        maxResults: {
          type: 'number',
          description: 'Max results (default: 6)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_memory',
    description: 'Read full content from a memory file. Use after search_memory for complete context.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path (from search results)',
        },
        from: {
          type: 'number',
          description: 'Start line number (1-indexed)',
        },
        lines: {
          type: 'number',
          description: 'Number of lines (default: 50)',
        },
      },
      required: ['path'],
    },
  },
]

// Tool handler interface
export interface MemoryToolHandler {
  search_memory: (args: { query: string; maxResults?: number }) => Promise<string>
  get_memory: (args: { path: string; from?: number; lines?: number }) => Promise<string>
}

export function createMemoryTools(
  agentName: string,
):
  | { tools: Anthropic.Tool[]; handleToolCall: (toolName: string, args: Record<string, unknown>) => Promise<string> }
  | undefined {
  // Skip if QMD not available
  if (!qmd.isQmdAvailable()) {
    return undefined
  }

  const handlers: MemoryToolHandler = {
    async search_memory(args) {
      const { query, maxResults } = args

      // Ensure index exists
      if (!(await qmd.indexExists(agentName))) {
        await qmd.initializeIndex(agentName)
      }

      const results = await qmd.search({ agentName, maxResults }, query)

      if (results.length === 0) {
        return 'No relevant memories found.'
      }

      const formatted = results
        .map((r, i) => {
          const location = r.lines ? `${r.path}:${r.lines.start}-${r.lines.end}` : r.path
          return `${i + 1}. [${r.score.toFixed(2)}] ${location}\n   ${r.title}\n   ${r.snippet}`
        })
        .join('\n\n')

      return formatted
    },

    async get_memory(args) {
      const { path, from, lines = 50 } = args

      const content = await qmd.getDocument(agentName, path, { from, lines })

      if (!content) {
        return `File not found or empty: ${path}`
      }

      return content
    },
  }

  async function handleToolCall(
    toolName: keyof MemoryToolHandler,
    args: Record<string, unknown>,
  ): Promise<string> {
    const handler = handlers[toolName]
    if (!handler) {
      return `Unknown tool: ${toolName}`
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (handler as any)(args)
    } catch (error) {
      return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  return {
    tools: memoryToolDefinitions,
    handleToolCall,
  }
}
