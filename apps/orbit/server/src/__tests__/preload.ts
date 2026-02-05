/**
 * Test Preload
 *
 * Runs before any test file. Sets up test database using drizzle-kit/api.
 */

import { Database } from 'bun:sqlite'
import { existsSync, unlinkSync } from 'fs'

import * as schema from '@db'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'

// Test database path
const TEST_DB_PATH = '/tmp/orbit-test.db'

// Set environment before any other imports use it
process.env.DATABASE_PATH = TEST_DB_PATH

// Remove existing test db for clean slate
if (existsSync(TEST_DB_PATH)) {
  unlinkSync(TEST_DB_PATH)
}
if (existsSync(`${TEST_DB_PATH}-wal`)) {
  unlinkSync(`${TEST_DB_PATH}-wal`)
}
if (existsSync(`${TEST_DB_PATH}-shm`)) {
  unlinkSync(`${TEST_DB_PATH}-shm`)
}

// Create database and apply schema
const sqlite = new Database(TEST_DB_PATH)
sqlite.exec('PRAGMA journal_mode = WAL;')

// Generate SQL from drizzle schema
const prevSchemaJson = await generateSQLiteDrizzleJson({})
const currentSchemaJson = await generateSQLiteDrizzleJson(schema)
const statements = await generateSQLiteMigration(prevSchemaJson, currentSchemaJson)
const migrationSql = statements.join(';\n')

// Apply schema
sqlite.exec(migrationSql)
sqlite.close()
