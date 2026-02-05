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
