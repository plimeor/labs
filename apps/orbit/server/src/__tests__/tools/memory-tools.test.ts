/**
 * BDD Tests for Memory Tools
 *
 * Tests memory search and retrieval tools including:
 * - search_memory: Hybrid search with QMD
 * - get_memory: Retrieve full document content
 *
 * These tests use mocked QMD service
 */

import { describe, it, expect, beforeEach } from 'bun:test'

import {
  resetMockQmd,
  setQmdAvailable,
  setIndexExists,
  setSearchResults,
  setDocument,
  createMockSearchResult,
  createMockSearchResults,
  getMockQmdState,
} from '../mocks/qmd.mock'
// ============================================================
// Memory Tool Handlers (inline using mocked QMD)
// ============================================================
// Import mock functions directly
import * as mockQmd from '../mocks/qmd.mock'

interface MemoryToolHandlers {
  search_memory: (args: { query: string; maxResults?: number }) => Promise<string>
  get_memory: (args: { path: string; from?: number; lines?: number }) => Promise<string>
}

function createMemoryToolHandlers(agentName: string): MemoryToolHandlers | undefined {
  // Skip if QMD not available
  if (!mockQmd.isQmdAvailable()) {
    return undefined
  }

  return {
    async search_memory(args) {
      const { query, maxResults } = args

      try {
        // Ensure index exists
        if (!(await mockQmd.indexExists(agentName))) {
          await mockQmd.initializeIndex(agentName)
        }

        const results = await mockQmd.search({ agentName, maxResults }, query)

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `Memory search failed: ${message}`
      }
    },

    async get_memory(args) {
      const { path, from, lines = 50 } = args

      try {
        const content = await mockQmd.getDocument(agentName, path, { from, lines })

        if (!content) {
          return `File is empty: ${path}`
        }

        return content
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `Failed to read memory file: ${message}`
      }
    },
  }
}

// ============================================================
// BDD Tests
// ============================================================

describe('Memory Tools', () => {
  beforeEach(() => {
    resetMockQmd()
  })

  // ----------------------------------------------------------
  // Feature: QMD Availability Check
  // ----------------------------------------------------------
  describe('Feature: QMD Availability Check', () => {
    it('should return undefined when QMD not installed', () => {
      setQmdAvailable(false)
      const handlers = createMemoryToolHandlers('test-agent')
      expect(handlers).toBeUndefined()
    })

    it('should return handlers with search_memory and get_memory when QMD installed', () => {
      setQmdAvailable(true)
      const handlers = createMemoryToolHandlers('test-agent')
      expect(handlers).toBeDefined()
      expect(handlers!.search_memory).toBeDefined()
      expect(handlers!.get_memory).toBeDefined()
    })
  })

  // ----------------------------------------------------------
  // Feature: search_memory Tool
  // ----------------------------------------------------------
  describe('Feature: search_memory Tool', () => {
    it('should return formatted search results', async () => {
      setQmdAvailable(true)
      setIndexExists('memory-agent', true)
      setSearchResults('memory-agent', [
        createMockSearchResult({
          path: '/memory/2025-02-05.md',
          score: 0.95,
          title: 'Daily Memory - 2025-02-05',
          snippet: 'Discussion about project planning...',
        }),
      ])

      const handlers = createMemoryToolHandlers('memory-agent')
      const result = await handlers!.search_memory({ query: 'project planning' })

      expect(result).toContain('/memory/2025-02-05.md')
      expect(result).toContain('0.95')
      expect(result).toContain('Daily Memory')
      expect(result).toContain('project planning')
    })

    it('should return no results message when no matches', async () => {
      setQmdAvailable(true)
      setIndexExists('empty-agent', true)
      setSearchResults('empty-agent', [])

      const handlers = createMemoryToolHandlers('empty-agent')
      const result = await handlers!.search_memory({ query: 'nonexistent topic' })

      expect(result).toBe('No relevant memories found.')
    })

    it('should initialize index if not exists', async () => {
      setQmdAvailable(true)
      setIndexExists('new-agent', false)
      setSearchResults('new-agent', [])

      const handlers = createMemoryToolHandlers('new-agent')
      await handlers!.search_memory({ query: 'test' })

      const state = getMockQmdState()
      expect(state.initializedAgents.has('new-agent')).toBe(true)
      expect(state.indexExists.get('new-agent')).toBe(true)
    })

    it('should respect maxResults parameter', async () => {
      setQmdAvailable(true)
      setIndexExists('many-memories', true)
      setSearchResults('many-memories', createMockSearchResults(10))

      const handlers = createMemoryToolHandlers('many-memories')
      const result = await handlers!.search_memory({ query: 'test', maxResults: 3 })

      const resultCount = (result.match(/^\d+\./gm) || []).length
      expect(resultCount).toBe(3)
    })

    it('should include line numbers when available', async () => {
      setQmdAvailable(true)
      setIndexExists('line-agent', true)
      setSearchResults('line-agent', [
        createMockSearchResult({
          path: '/memory/2025-02-05.md',
          score: 0.9,
          title: 'Daily Memory',
          snippet: 'Important content here...',
          lines: { start: 10, end: 25 },
        }),
      ])

      const handlers = createMemoryToolHandlers('line-agent')
      const result = await handlers!.search_memory({ query: 'test' })

      expect(result).toContain(':10-25')
    })
  })

  // ----------------------------------------------------------
  // Feature: get_memory Tool
  // ----------------------------------------------------------
  describe('Feature: get_memory Tool', () => {
    it('should return full document content', async () => {
      const content =
        '# Daily Memory - 2025-02-05\n\n## 09:00 - chat\n\n**Prompt:** User asked about testing'
      setQmdAvailable(true)
      setDocument('doc-agent', '/memory/2025-02-05.md', content)

      const handlers = createMemoryToolHandlers('doc-agent')
      const result = await handlers!.get_memory({ path: '/memory/2025-02-05.md' })

      expect(result).toBe(content)
    })

    it('should return error for non-existent document', async () => {
      setQmdAvailable(true)

      const handlers = createMemoryToolHandlers('missing-doc-agent')
      const result = await handlers!.get_memory({ path: '/nonexistent.md' })

      expect(result).toContain('Failed to read memory file')
    })

    it('should return empty file message for empty document', async () => {
      setQmdAvailable(true)
      setDocument('empty-doc-agent', '/memory/empty.md', '')

      const handlers = createMemoryToolHandlers('empty-doc-agent')
      const result = await handlers!.get_memory({ path: '/memory/empty.md' })

      expect(result).toContain('File is empty')
    })
  })

  // ----------------------------------------------------------
  // Feature: Multiple Agents Isolation
  // ----------------------------------------------------------
  describe('Feature: Multiple Agents Isolation', () => {
    it('should isolate each agent memory index', async () => {
      setQmdAvailable(true)

      setIndexExists('agent-a', true)
      setSearchResults('agent-a', [
        createMockSearchResult({ path: '/memory/a-mem.md', title: 'Agent A Memory' }),
      ])

      setIndexExists('agent-b', true)
      setSearchResults('agent-b', [
        createMockSearchResult({ path: '/memory/b-mem.md', title: 'Agent B Memory' }),
      ])

      setDocument('agent-a', '/doc-a.md', 'Content for A')
      setDocument('agent-b', '/doc-b.md', 'Content for B')

      const handlersA = createMemoryToolHandlers('agent-a')
      const handlersB = createMemoryToolHandlers('agent-b')

      const resultA = await handlersA!.search_memory({ query: 'test' })
      const resultB = await handlersB!.search_memory({ query: 'test' })
      const docA = await handlersA!.get_memory({ path: '/doc-a.md' })
      const docB = await handlersB!.get_memory({ path: '/doc-b.md' })

      expect(resultA).toContain('Agent A Memory')
      expect(resultA).not.toContain('Agent B Memory')
      expect(resultB).toContain('Agent B Memory')
      expect(resultB).not.toContain('Agent A Memory')
      expect(docA).toBe('Content for A')
      expect(docB).toBe('Content for B')
    })
  })
})
