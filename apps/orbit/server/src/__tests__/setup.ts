/**
 * Test setup and utilities for BDD-style tests
 *
 * This module provides:
 * - Mock factories for common test objects
 *
 * For test database setup, use helpers/test-db.ts instead.
 */

// Re-export test database utilities from the consolidated module
export {
  createTestDb,
  createTestDbSync,
  closeTestDb,
  clearAllTables,
  initSchemaCache,
  type TestDb,
  type TestDatabase,
} from './helpers/test-db'

// ============================================================
// Mock Factories
// ============================================================

export interface MockAgent {
  id: number
  name: string
  status: 'active' | 'inactive'
  workspacePath: string
  createdAt: Date
  lastActiveAt: Date | null
}

/**
 * Create a mock agent object
 */
export function createMockAgent(overrides: Partial<MockAgent> = {}): MockAgent {
  return {
    id: 1,
    name: 'test-agent',
    status: 'active',
    workspacePath: '/tmp/orbit/agents/test-agent',
    createdAt: new Date(),
    lastActiveAt: null,
    ...overrides,
  }
}

export interface MockTask {
  id: number
  agentId: number
  name: string | null
  prompt: string
  scheduleType: 'cron' | 'interval' | 'once'
  scheduleValue: string
  contextMode: 'isolated' | 'main'
  status: 'active' | 'paused' | 'completed'
  nextRun: Date | null
  lastRun: Date | null
  createdAt: Date
}

/**
 * Create a mock scheduled task object
 */
export function createMockTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    id: 1,
    agentId: 1,
    name: 'Test Task',
    prompt: 'Do something',
    scheduleType: 'interval',
    scheduleValue: '3600000',
    contextMode: 'isolated',
    status: 'active',
    nextRun: new Date(Date.now() + 3600000),
    lastRun: null,
    createdAt: new Date(),
    ...overrides,
  }
}

export interface MockInboxMessage {
  id: number
  fromAgentId: number
  toAgentId: number
  message: string
  messageType: 'request' | 'response'
  requestId: string | null
  status: 'pending' | 'read' | 'archived'
  createdAt: Date
  readAt: Date | null
}

/**
 * Create a mock inbox message object
 */
export function createMockInboxMessage(
  overrides: Partial<MockInboxMessage> = {},
): MockInboxMessage {
  return {
    id: 1,
    fromAgentId: 1,
    toAgentId: 2,
    message: 'Hello from agent 1',
    messageType: 'request',
    requestId: null,
    status: 'pending',
    createdAt: new Date(),
    readAt: null,
    ...overrides,
  }
}
