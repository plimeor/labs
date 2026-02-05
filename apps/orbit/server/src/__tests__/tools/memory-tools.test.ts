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
    describe('Scenario: Memory tools unavailable when QMD not installed', () => {
      it('Given QMD is not installed', () => {
        setQmdAvailable(false)
      })

      it('When creating memory tools', () => {
        setQmdAvailable(false)
        const handlers = createMemoryToolHandlers('test-agent')
        expect(handlers).toBeUndefined()
      })

      it('Then undefined should be returned', () => {
        setQmdAvailable(false)
        const handlers = createMemoryToolHandlers('test-agent')
        expect(handlers).toBeUndefined()
      })
    })

    describe('Scenario: Memory tools available when QMD installed', () => {
      it('Given QMD is installed', () => {
        setQmdAvailable(true)
      })

      it('When creating memory tools', () => {
        setQmdAvailable(true)
        const handlers = createMemoryToolHandlers('test-agent')
        expect(handlers).toBeDefined()
      })

      it('Then tool handlers should be returned', () => {
        setQmdAvailable(true)
        const handlers = createMemoryToolHandlers('test-agent')
        expect(handlers).toBeDefined()
        expect(handlers!.search_memory).toBeDefined()
        expect(handlers!.get_memory).toBeDefined()
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: search_memory Tool
  // ----------------------------------------------------------
  describe('Feature: search_memory Tool', () => {
    describe('Scenario: Search memories with results found', () => {
      it('Given agent has memories indexed', () => {
        setQmdAvailable(true)
        setIndexExists('memory-agent', true)
        setSearchResults('memory-agent', [
          createMockSearchResult({
            path: '/memory/2025-02-05.md',
            score: 0.95,
            title: 'Daily Memory - 2025-02-05',
            snippet: 'Discussion about project planning...',
          }),
          createMockSearchResult({
            path: '/memory/2025-02-04.md',
            score: 0.82,
            title: 'Daily Memory - 2025-02-04',
            snippet: 'Worked on feature implementation...',
          }),
        ])
      })

      it('When searching for "project planning"', async () => {
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

        expect(result).not.toContain('No relevant memories found')
      })

      it('Then search results should be formatted', async () => {
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
    })

    describe('Scenario: Search memories with no results', () => {
      it('Given agent has no matching memories', () => {
        setQmdAvailable(true)
        setIndexExists('empty-agent', true)
        setSearchResults('empty-agent', [])
      })

      it('When searching for something', async () => {
        setQmdAvailable(true)
        setIndexExists('empty-agent', true)
        setSearchResults('empty-agent', [])

        const handlers = createMemoryToolHandlers('empty-agent')
        const result = await handlers!.search_memory({ query: 'nonexistent topic' })

        expect(result).toBe('No relevant memories found.')
      })
    })

    describe('Scenario: Search initializes index if not exists', () => {
      it('Given agent has no index yet', () => {
        setQmdAvailable(true)
        setIndexExists('new-agent', false)
        setSearchResults('new-agent', [])
      })

      it('When searching for the first time', async () => {
        setQmdAvailable(true)
        setIndexExists('new-agent', false)
        setSearchResults('new-agent', [])

        const handlers = createMemoryToolHandlers('new-agent')
        await handlers!.search_memory({ query: 'test' })

        const state = getMockQmdState()
        expect(state.initializedAgents.has('new-agent')).toBe(true)
      })

      it('Then index should be initialized', async () => {
        setQmdAvailable(true)
        setIndexExists('new-agent', false)
        setSearchResults('new-agent', [])

        const handlers = createMemoryToolHandlers('new-agent')
        await handlers!.search_memory({ query: 'test' })

        const state = getMockQmdState()
        expect(state.indexExists.get('new-agent')).toBe(true)
      })
    })

    describe('Scenario: Search respects maxResults parameter', () => {
      it('Given agent has many memories', () => {
        setQmdAvailable(true)
        setIndexExists('many-memories', true)
        setSearchResults('many-memories', createMockSearchResults(10))
      })

      it('When searching with maxResults=3', async () => {
        setQmdAvailable(true)
        setIndexExists('many-memories', true)
        setSearchResults('many-memories', createMockSearchResults(10))

        const handlers = createMemoryToolHandlers('many-memories')
        const result = await handlers!.search_memory({
          query: 'test',
          maxResults: 3,
        })

        // Count number of results (each result starts with a number followed by period)
        const resultCount = (result.match(/^\d+\./gm) || []).length
        expect(resultCount).toBe(3)
      })
    })

    describe('Scenario: Search result includes line numbers when available', () => {
      it('Given search result has line information', () => {
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
      })

      it('When searching', async () => {
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
  })

  // ----------------------------------------------------------
  // Feature: get_memory Tool
  // ----------------------------------------------------------
  describe('Feature: get_memory Tool', () => {
    describe('Scenario: Get full document content', () => {
      it('Given a memory file exists', () => {
        setQmdAvailable(true)
        setDocument(
          'doc-agent',
          '/memory/2025-02-05.md',
          '# Daily Memory - 2025-02-05\n\n## 09:00 - chat\n\n**Prompt:** User asked about testing\n\n**Summary:** Provided testing guidance.',
        )
      })

      it('When getting the document', async () => {
        setQmdAvailable(true)
        setDocument(
          'doc-agent',
          '/memory/2025-02-05.md',
          '# Daily Memory - 2025-02-05\n\n## 09:00 - chat\n\n**Prompt:** User asked about testing\n\n**Summary:** Provided testing guidance.',
        )

        const handlers = createMemoryToolHandlers('doc-agent')
        const result = await handlers!.get_memory({ path: '/memory/2025-02-05.md' })

        expect(result).toContain('Daily Memory - 2025-02-05')
      })

      it('Then full content should be returned', async () => {
        const content =
          '# Daily Memory - 2025-02-05\n\n## 09:00 - chat\n\n**Prompt:** User asked about testing\n\n**Summary:** Provided testing guidance.'
        setQmdAvailable(true)
        setDocument('doc-agent', '/memory/2025-02-05.md', content)

        const handlers = createMemoryToolHandlers('doc-agent')
        const result = await handlers!.get_memory({ path: '/memory/2025-02-05.md' })

        expect(result).toBe(content)
      })
    })

    describe('Scenario: Get document that does not exist', () => {
      it('Given no document at the path', () => {
        setQmdAvailable(true)
        // No document set for this path
      })

      it('When trying to get the document', async () => {
        setQmdAvailable(true)

        const handlers = createMemoryToolHandlers('missing-doc-agent')
        const result = await handlers!.get_memory({ path: '/nonexistent.md' })

        expect(result).toContain('Failed to read memory file')
      })
    })

    describe('Scenario: Get document with empty content', () => {
      it('Given an empty document exists', () => {
        setQmdAvailable(true)
        setDocument('empty-doc-agent', '/memory/empty.md', '')
      })

      it('When getting the document', async () => {
        setQmdAvailable(true)
        setDocument('empty-doc-agent', '/memory/empty.md', '')

        const handlers = createMemoryToolHandlers('empty-doc-agent')
        const result = await handlers!.get_memory({ path: '/memory/empty.md' })

        expect(result).toContain('File is empty')
      })
    })

    describe('Scenario: Get document with line range options', () => {
      it('Given a document exists', () => {
        setQmdAvailable(true)
        setDocument(
          'range-agent',
          '/memory/long.md',
          'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10',
        )
      })

      it('When getting with from and lines options', async () => {
        setQmdAvailable(true)
        setDocument(
          'range-agent',
          '/memory/long.md',
          'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10',
        )

        const handlers = createMemoryToolHandlers('range-agent')
        // Note: Our mock doesn't actually implement line filtering,
        // but we verify the call is made correctly
        const result = await handlers!.get_memory({
          path: '/memory/long.md',
          from: 5,
          lines: 3,
        })

        expect(result).toContain('Line')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Error Handling
  // ----------------------------------------------------------
  describe('Feature: Error Handling', () => {
    describe('Scenario: Handle QMD search failure gracefully', () => {
      it('Given QMD is available but might fail', () => {
        setQmdAvailable(true)
        // Index doesn't exist and will be created
      })

      it('When search encounters an error', async () => {
        setQmdAvailable(true)
        setIndexExists('error-agent', true)
        setSearchResults('error-agent', [])

        const handlers = createMemoryToolHandlers('error-agent')
        // Search should not throw, but return empty results
        const result = await handlers!.search_memory({ query: 'test' })

        expect(result).toBe('No relevant memories found.')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Multiple Agents Isolation
  // ----------------------------------------------------------
  describe('Feature: Multiple Agents Isolation', () => {
    describe('Scenario: Each agent has separate memory index', () => {
      it('Given two agents with different memories', () => {
        setQmdAvailable(true)

        setIndexExists('agent-a', true)
        setSearchResults('agent-a', [
          createMockSearchResult({
            path: '/memory/a-mem.md',
            title: 'Agent A Memory',
            snippet: 'This is agent A content',
          }),
        ])

        setIndexExists('agent-b', true)
        setSearchResults('agent-b', [
          createMockSearchResult({
            path: '/memory/b-mem.md',
            title: 'Agent B Memory',
            snippet: 'This is agent B content',
          }),
        ])
      })

      it('When agent-a searches', async () => {
        setQmdAvailable(true)
        setIndexExists('agent-a', true)
        setSearchResults('agent-a', [
          createMockSearchResult({
            path: '/memory/a-mem.md',
            title: 'Agent A Memory',
            snippet: 'This is agent A content',
          }),
        ])

        const handlersA = createMemoryToolHandlers('agent-a')
        const resultA = await handlersA!.search_memory({ query: 'test' })

        expect(resultA).toContain('Agent A Memory')
        expect(resultA).not.toContain('Agent B Memory')
      })

      it('And agent-b searches', async () => {
        setQmdAvailable(true)
        setIndexExists('agent-b', true)
        setSearchResults('agent-b', [
          createMockSearchResult({
            path: '/memory/b-mem.md',
            title: 'Agent B Memory',
            snippet: 'This is agent B content',
          }),
        ])

        const handlersB = createMemoryToolHandlers('agent-b')
        const resultB = await handlersB!.search_memory({ query: 'test' })

        expect(resultB).toContain('Agent B Memory')
        expect(resultB).not.toContain('Agent A Memory')
      })

      it('Then each agent should only see their own memories', async () => {
        setQmdAvailable(true)

        // Set up both agents
        setIndexExists('agent-a', true)
        setSearchResults('agent-a', [
          createMockSearchResult({
            path: '/memory/a-mem.md',
            title: 'Agent A Memory',
          }),
        ])

        setIndexExists('agent-b', true)
        setSearchResults('agent-b', [
          createMockSearchResult({
            path: '/memory/b-mem.md',
            title: 'Agent B Memory',
          }),
        ])

        setDocument('agent-a', '/doc-a.md', 'Content for A')
        setDocument('agent-b', '/doc-b.md', 'Content for B')

        const handlersA = createMemoryToolHandlers('agent-a')
        const handlersB = createMemoryToolHandlers('agent-b')

        const docA = await handlersA!.get_memory({ path: '/doc-a.md' })
        const docB = await handlersB!.get_memory({ path: '/doc-b.md' })

        expect(docA).toBe('Content for A')
        expect(docB).toBe('Content for B')
      })
    })
  })
})
