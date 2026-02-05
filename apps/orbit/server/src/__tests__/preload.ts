/**
 * Test Preload
 *
 * Runs before any test file. Sets up test database and workspace paths.
 */

import { Database } from 'bun:sqlite'
import { existsSync, unlinkSync, rmSync, mkdirSync } from 'fs'

import * as schema from '@db'
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'

// Test paths - set before any other imports use them
const TEST_DB_PATH = '/tmp/orbit-test.db'
const TEST_ORBIT_BASE_PATH = '/tmp/orbit-test'

process.env.DATABASE_PATH = TEST_DB_PATH
process.env.ORBIT_BASE_PATH = TEST_ORBIT_BASE_PATH

// Clean up test workspace directory
if (existsSync(TEST_ORBIT_BASE_PATH)) {
  rmSync(TEST_ORBIT_BASE_PATH, { recursive: true })
}
mkdirSync(TEST_ORBIT_BASE_PATH, { recursive: true })

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
