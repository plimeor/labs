/**
 * Test Database Helpers
 *
 * Utilities for test database operations.
 * Database setup is handled by preload.ts.
 */

import { sql } from 'drizzle-orm'

import { db } from '@/core/db'

/**
 * Clear all data from tables (call in beforeEach for isolation)
 */
export async function clearAllTables(): Promise<void> {
  await db.run(sql`DELETE FROM messages`)
  await db.run(sql`DELETE FROM chat_sessions`)
  await db.run(sql`DELETE FROM user_inbox`)
  await db.run(sql`DELETE FROM agent_inbox`)
  await db.run(sql`DELETE FROM task_runs`)
  await db.run(sql`DELETE FROM scheduled_tasks`)
  await db.run(sql`DELETE FROM agents`)
}

// ============================================================
// Time Comparison Helpers
// ============================================================

/** Default tolerance for timestamp comparisons (1 second) */
const DEFAULT_TIME_TOLERANCE_MS = 1000

/**
 * Check if a timestamp is approximately now (within tolerance)
 */
export function isApproximatelyNow(
  timestamp: Date | number | null | undefined,
  toleranceMs = DEFAULT_TIME_TOLERANCE_MS
): boolean {
  if (timestamp == null) return false
  const time = typeof timestamp === 'number' ? timestamp : timestamp.getTime()
  return Math.abs(Date.now() - time) <= toleranceMs
}

/**
 * Check if two timestamps are approximately equal (within tolerance)
 */
export function isApproximatelyEqual(
  actual: Date | number | null | undefined,
  expected: Date | number,
  toleranceMs = DEFAULT_TIME_TOLERANCE_MS
): boolean {
  if (actual == null) return false
  const actualTime = typeof actual === 'number' ? actual : actual.getTime()
  const expectedTime = typeof expected === 'number' ? expected : expected.getTime()
  return Math.abs(actualTime - expectedTime) <= toleranceMs
}

/**
 * Check if a timestamp is at or after a reference time (with tolerance)
 */
export function isAtOrAfter(
  timestamp: Date | number | null | undefined,
  reference: Date | number,
  toleranceMs = DEFAULT_TIME_TOLERANCE_MS
): boolean {
  if (timestamp == null) return false
  const time = typeof timestamp === 'number' ? timestamp : timestamp.getTime()
  const refTime = typeof reference === 'number' ? reference : reference.getTime()
  return time >= refTime - toleranceMs
}
