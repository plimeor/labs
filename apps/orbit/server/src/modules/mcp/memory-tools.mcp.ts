import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import * as qmd from '@/modules/agent/services/qmd.service'

export function createMemoryMcpServer(agentName: string) {
  return createSdkMcpServer({
    name: 'memory-tools',
    version: '1.0.0',
    tools: [
      tool(
        'search_memory',
        'Search your memories and notes using hybrid search (BM25 + vector + LLM reranking).',
        {
          query: z.string().describe('What to search for'),
          maxResults: z.number().optional().default(6).describe('Max results (default: 6)')
        },
        async args => {
          try {
            if (!(await qmd.indexExists(agentName))) {
              await qmd.initializeIndex(agentName)
            }

            const results = await qmd.search({ agentName, maxResults: args.maxResults }, args.query)

            if (results.length === 0) {
              return { content: [{ type: 'text' as const, text: 'No relevant memories found.' }] }
            }

            const formatted = results
              .map((r, i) => {
                const location = r.lines ? `${r.path}:${r.lines.start}-${r.lines.end}` : r.path
                return `${i + 1}. [${r.score.toFixed(2)}] ${location}\n   ${r.title}\n   ${r.snippet}`
              })
              .join('\n\n')

            return { content: [{ type: 'text' as const, text: formatted }] }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              content: [{ type: 'text' as const, text: `Memory search failed: ${message}` }]
            }
          }
        }
      ),

      tool(
        'get_memory',
        'Read full content from a memory file. Use after search_memory for complete context.',
        {
          path: z.string().describe('File path (from search results)'),
          from: z.number().optional().describe('Start line number (1-indexed)'),
          lines: z.number().optional().default(50).describe('Number of lines (default: 50)')
        },
        async args => {
          try {
            const content = await qmd.getDocument(agentName, args.path, {
              from: args.from,
              lines: args.lines
            })

            if (!content) {
              return { content: [{ type: 'text' as const, text: `File is empty: ${args.path}` }] }
            }

            return { content: [{ type: 'text' as const, text: content }] }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            return {
              content: [{ type: 'text' as const, text: `Failed to read memory file: ${message}` }]
            }
          }
        }
      )
    ]
  })
}
