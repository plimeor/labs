/**
 * Test setup and utilities for BDD-style tests
 *
 * This module provides:
 * - In-memory SQLite database for testing
 * - Mock factories for common test objects
 * - Test lifecycle helpers
 */

import { Database } from 'bun:sqlite'
import { join } from 'path'

import * as schema from '@db'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

// Test database type
export type TestDb = BunSQLiteDatabase<typeof schema>

/**
 * Create an in-memory test database with all migrations applied
 */
export function createTestDb(): { db: TestDb; sqlite: Database } {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL;')

  const db = drizzle(sqlite, { schema })

  // Apply migrations
  const migrationsFolder = join(import.meta.dir, '..', '..', 'drizzle', 'migrations')
  try {
    migrate(db, { migrationsFolder })
  } catch {
    // If migrations folder doesn't exist, create tables manually
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        workspace_path TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        last_active_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        name TEXT,
        prompt TEXT NOT NULL,
        schedule_type TEXT NOT NULL,
        schedule_value TEXT NOT NULL,
        context_mode TEXT NOT NULL DEFAULT 'isolated',
        status TEXT NOT NULL DEFAULT 'active',
        next_run INTEGER,
        last_run INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS agent_inbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_agent_id INTEGER NOT NULL,
        to_agent_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        message_type TEXT NOT NULL DEFAULT 'request',
        request_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        read_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS chat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        user_id TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        last_message_at INTEGER,
        message_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        agent_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS task_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        result TEXT,
        error TEXT,
        duration_ms INTEGER,
        started_at INTEGER NOT NULL DEFAULT (unixepoch()),
        completed_at INTEGER
      );
    `)
  }

  return { db, sqlite }
}

/**
 * Clean up test database
 */
export function cleanupTestDb(sqlite: Database): void {
  sqlite.close()
}

/**
 * Clear all tables in test database
 */
export function clearAllTables(db: TestDb): void {
  db.run(schema.agents.id, 'DELETE FROM agents')
  db.run(schema.scheduledTasks.id, 'DELETE FROM scheduled_tasks')
  db.run(schema.agentInbox.id, 'DELETE FROM agent_inbox')
}

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

// ============================================================
// BDD Test Helpers
// ============================================================

/**
 * Context object for BDD-style tests
 * Allows sharing state between Given/When/Then steps
 */
export class TestContext<T = Record<string, unknown>> {
  private data: T

  constructor(initialData: T) {
    this.data = initialData
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
  }

  update(partial: Partial<T>): void {
    this.data = { ...this.data, ...partial }
  }
}

/**
 * Create a test context for BDD tests
 */
export function createTestContext<T extends Record<string, unknown>>(
  initialData: T = {} as T,
): TestContext<T> {
  return new TestContext<T>(initialData)
}
