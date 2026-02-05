/**
 * Test Database Setup
 *
 * Creates an in-memory SQLite database using drizzle schema.
 * Uses drizzle-kit/api to generate SQL from schema programmatically.
 *
 * @see https://github.com/drizzle-team/drizzle-orm/discussions/1901
 */

import { Database } from 'bun:sqlite'

import * as schema from '@db'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import { sql } from 'drizzle-orm'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'

export type TestDb = BunSQLiteDatabase<typeof schema>

export interface TestDatabase {
  db: TestDb
  sqlite: Database
}

// Cache the generated SQL to avoid regenerating on every test
let cachedMigrationSql: string | null = null

/**
 * Generate CREATE TABLE SQL from drizzle schema
 */
async function generateSchemaSQL(): Promise<string> {
  if (cachedMigrationSql) {
    return cachedMigrationSql
  }

  // Generate SQL from empty schema to current schema
  const prevSchemaJson = await generateSQLiteDrizzleJson({})
  const currentSchemaJson = await generateSQLiteDrizzleJson(schema)
  const statements = await generateSQLiteMigration(prevSchemaJson, currentSchemaJson)

  cachedMigrationSql = statements.join(';\n')
  return cachedMigrationSql
}

/**
 * Create an in-memory test database with schema from drizzle definitions
 */
export async function createTestDb(): Promise<TestDatabase> {
  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL;')

  // Generate and execute SQL from drizzle schema
  const migrationSql = await generateSchemaSQL()
  sqlite.exec(migrationSql)

  const db = drizzle(sqlite, { schema })

  return { db, sqlite }
}

/**
 * Sync version for simpler test setup (uses cached SQL)
 * Call createTestDb() once at module load to warm up the cache
 */
export function createTestDbSync(): TestDatabase {
  if (!cachedMigrationSql) {
    throw new Error('Call createTestDb() first to initialize schema cache')
  }

  const sqlite = new Database(':memory:')
  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec(cachedMigrationSql)

  const db = drizzle(sqlite, { schema })

  return { db, sqlite }
}

/**
 * Clean up test database
 */
export function closeTestDb(testDb: TestDatabase): void {
  testDb.sqlite.close()
}

/**
 * Clear all data from tables (useful between tests)
 */
export function clearAllTables(db: TestDb): void {
  db.run(sql`DELETE FROM messages`)
  db.run(sql`DELETE FROM chat_sessions`)
  db.run(sql`DELETE FROM user_inbox`)
  db.run(sql`DELETE FROM agent_inbox`)
  db.run(sql`DELETE FROM task_runs`)
  db.run(sql`DELETE FROM scheduled_tasks`)
  db.run(sql`DELETE FROM agents`)
}

/**
 * Initialize the schema cache (call this once before tests)
 */
export async function initSchemaCache(): Promise<void> {
  await generateSchemaSQL()
}

// ============================================================
// Time Comparison Helpers
// ============================================================

/** Default tolerance for timestamp comparisons (1 second) */
const DEFAULT_TIME_TOLERANCE_MS = 1000

/**
 * Assert that a timestamp is approximately now (within tolerance).
 * Helps avoid flaky tests due to timing differences.
 *
 * @param timestamp - The timestamp to check
 * @param toleranceMs - Tolerance in milliseconds (default: 1000ms)
 * @returns true if timestamp is within tolerance of now
 */
export function isApproximatelyNow(
  timestamp: Date | number | null | undefined,
  toleranceMs = DEFAULT_TIME_TOLERANCE_MS,
): boolean {
  if (timestamp == null) return false

  const time = typeof timestamp === 'number' ? timestamp : timestamp.getTime()
  const now = Date.now()

  return Math.abs(now - time) <= toleranceMs
}

/**
 * Assert that a timestamp is approximately equal to another (within tolerance).
 *
 * @param actual - The actual timestamp
 * @param expected - The expected timestamp
 * @param toleranceMs - Tolerance in milliseconds (default: 1000ms)
 * @returns true if timestamps are within tolerance of each other
 */
export function isApproximatelyEqual(
  actual: Date | number | null | undefined,
  expected: Date | number,
  toleranceMs = DEFAULT_TIME_TOLERANCE_MS,
): boolean {
  if (actual == null) return false

  const actualTime = typeof actual === 'number' ? actual : actual.getTime()
  const expectedTime = typeof expected === 'number' ? expected : expected.getTime()

  return Math.abs(actualTime - expectedTime) <= toleranceMs
}

/**
 * Assert that a timestamp is at or after a reference time (with tolerance).
 *
 * @param timestamp - The timestamp to check
 * @param reference - The reference time
 * @param toleranceMs - Tolerance in milliseconds (default: 1000ms)
 * @returns true if timestamp is at or after reference (within tolerance)
 */
export function isAtOrAfter(
  timestamp: Date | number | null | undefined,
  reference: Date | number,
  toleranceMs = DEFAULT_TIME_TOLERANCE_MS,
): boolean {
  if (timestamp == null) return false

  const time = typeof timestamp === 'number' ? timestamp : timestamp.getTime()
  const refTime = typeof reference === 'number' ? reference : reference.getTime()

  return time >= refTime - toleranceMs
}

/**
 * Assert that a timestamp is in the future relative to a reference (with tolerance).
 *
 * @param timestamp - The timestamp to check
 * @param reference - The reference time (defaults to now)
 * @param toleranceMs - Tolerance in milliseconds (default: 1000ms)
 * @returns true if timestamp is after reference (within tolerance)
 */
export function isFutureTime(
  timestamp: Date | number | null | undefined,
  reference: Date | number = Date.now(),
  toleranceMs = DEFAULT_TIME_TOLERANCE_MS,
): boolean {
  if (timestamp == null) return false

  const time = typeof timestamp === 'number' ? timestamp : timestamp.getTime()
  const refTime = typeof reference === 'number' ? reference : reference.getTime()

  return time > refTime - toleranceMs
}
