/**
 * Mock for QMD (Query Markup Documents) service
 *
 * Provides a controllable mock of QMD functionality for testing
 * memory search features without requiring the actual QMD CLI.
 */

import type { SearchResult } from '@/modules/agents/services/qmd.service'

// ============================================================
// Types
// ============================================================

export interface MockQmdState {
  /** Whether QMD is "available" (installed) */
  isAvailable: boolean

  /** Map of agent name to their index existence */
  indexExists: Map<string, boolean>

  /** Map of agent name to their search results */
  searchResults: Map<string, SearchResult[]>

  /** Map of agent name + path to document content */
  documents: Map<string, string>

  /** Track which agents have been initialized */
  initializedAgents: Set<string>

  /** Track which agents have been updated */
  updatedAgents: Set<string>
}

// ============================================================
// Mock State
// ============================================================

/**
 * Create fresh mock state
 */
export function createMockQmdState(): MockQmdState {
  return {
    isAvailable: true,
    indexExists: new Map(),
    searchResults: new Map(),
    documents: new Map(),
    initializedAgents: new Set(),
    updatedAgents: new Set(),
  }
}

// Global mock state (can be reset between tests)
let mockState = createMockQmdState()

/**
 * Reset the mock state
 */
export function resetMockQmd(): void {
  mockState = createMockQmdState()
}

/**
 * Get current mock state (for assertions)
 */
export function getMockQmdState(): MockQmdState {
  return mockState
}

// ============================================================
// Mock Service Functions
// ============================================================

/**
 * Mock: Check if QMD is available
 */
export async function checkQmdAvailability(): Promise<boolean> {
  return mockState.isAvailable
}

/**
 * Mock: Sync check of QMD availability
 */
export function isQmdAvailable(): boolean {
  return mockState.isAvailable
}

/**
 * Mock: Initialize QMD index for an agent
 */
export async function initializeIndex(agentName: string): Promise<void> {
  if (!mockState.isAvailable) {
    throw new Error('QMD is not available')
  }

  mockState.initializedAgents.add(agentName)
  mockState.indexExists.set(agentName, true)
}

/**
 * Mock: Update QMD index for an agent
 */
export async function updateIndex(agentName: string): Promise<void> {
  if (!mockState.isAvailable) {
    throw new Error('QMD is not available')
  }

  mockState.updatedAgents.add(agentName)
}

/**
 * Mock: Search agent's memory
 */
export async function search(
  options: { agentName: string; maxResults?: number },
  _query: string,
): Promise<SearchResult[]> {
  if (!mockState.isAvailable) {
    throw new Error('QMD is not available')
  }

  const results = mockState.searchResults.get(options.agentName) ?? []
  const maxResults = options.maxResults ?? 6

  return results.slice(0, maxResults)
}

/**
 * Mock: Get document content
 */
export async function getDocument(
  agentName: string,
  path: string,
  _options?: { from?: number; lines?: number },
): Promise<string> {
  if (!mockState.isAvailable) {
    throw new Error('QMD is not available')
  }

  const key = `${agentName}:${path}`
  const content = mockState.documents.get(key)

  if (content === undefined) {
    throw new Error(`Document not found: ${path}`)
  }

  return content
}

/**
 * Mock: Check if index exists
 */
export async function indexExists(agentName: string): Promise<boolean> {
  return mockState.indexExists.get(agentName) ?? false
}

/**
 * Mock: Reset QMD availability cache
 */
export function resetQmdAvailability(): void {
  // No-op in mock
}

/**
 * Mock: Delete index for agent
 */
export async function deleteIndex(agentName: string): Promise<void> {
  mockState.indexExists.delete(agentName)
  mockState.initializedAgents.delete(agentName)
  mockState.updatedAgents.delete(agentName)
}

// ============================================================
// Test Setup Helpers
// ============================================================

/**
 * Configure QMD availability
 */
export function setQmdAvailable(available: boolean): void {
  mockState.isAvailable = available
}

/**
 * Set up search results for an agent
 */
export function setSearchResults(agentName: string, results: SearchResult[]): void {
  mockState.searchResults.set(agentName, results)
}

/**
 * Set up document content
 */
export function setDocument(agentName: string, path: string, content: string): void {
  const key = `${agentName}:${path}`
  mockState.documents.set(key, content)
}

/**
 * Mark an index as existing
 */
export function setIndexExists(agentName: string, exists: boolean): void {
  mockState.indexExists.set(agentName, exists)
}

// ============================================================
// Mock Search Result Builders
// ============================================================

/**
 * Create a mock search result
 */
export function createMockSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    docid: `doc_${Date.now()}`,
    path: '/memory/2025-02-05.md',
    score: 0.85,
    title: 'Daily Memory - 2025-02-05',
    snippet: 'This is a snippet from the memory file...',
    ...overrides,
  }
}

/**
 * Create multiple mock search results
 */
export function createMockSearchResults(count: number): SearchResult[] {
  return Array.from({ length: count }, (_, i) =>
    createMockSearchResult({
      docid: `doc_${i}`,
      path: `/memory/2025-02-0${i + 1}.md`,
      score: 0.9 - i * 0.1,
      title: `Daily Memory - 2025-02-0${i + 1}`,
      snippet: `Snippet from memory file ${i + 1}...`,
    }),
  )
}

// ============================================================
// Common Test Scenarios
// ============================================================

/**
 * Set up mock for a scenario where QMD is unavailable
 */
export function setupQmdUnavailable(): void {
  resetMockQmd()
  setQmdAvailable(false)
}

/**
 * Set up mock for a scenario where agent has existing memories
 */
export function setupAgentWithMemories(agentName: string, memoryCount = 3): void {
  resetMockQmd()
  setQmdAvailable(true)
  setIndexExists(agentName, true)
  setSearchResults(agentName, createMockSearchResults(memoryCount))

  // Set up some document content
  for (let i = 0; i < memoryCount; i++) {
    setDocument(
      agentName,
      `/memory/2025-02-0${i + 1}.md`,
      `# Daily Memory - 2025-02-0${i + 1}\n\n## 09:00 - chat\n\n**Prompt:** User asked about something\n\n**Summary:** I provided helpful information.`,
    )
  }
}

/**
 * Set up mock for a fresh agent with no memories
 */
export function setupFreshAgent(agentName: string): void {
  resetMockQmd()
  setQmdAvailable(true)
  setIndexExists(agentName, false)
  setSearchResults(agentName, [])
}

// ============================================================
// Export Mock Module
// ============================================================

/**
 * Complete mock module that can replace the real qmd.service
 */
export const mockQmdService = {
  checkQmdAvailability,
  isQmdAvailable,
  initializeIndex,
  updateIndex,
  search,
  getDocument,
  indexExists,
  resetQmdAvailability,
  deleteIndex,
}
