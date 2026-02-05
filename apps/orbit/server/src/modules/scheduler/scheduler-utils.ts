/**
 * Scheduler Utility Functions
 *
 * Pure functions for task scheduling operations.
 * @internal Exported for testing
 */

import { scheduledTasks, type ScheduledTask } from '@db/tasks'
import { and, eq, lte } from 'drizzle-orm'

import { db } from '@/core/db'

import { calculateNextRun } from '../agents/tools/orbit-tools'

// Re-export for convenience
export { calculateNextRun }

/**
 * Find all tasks that are due for execution
 * @internal Exported for testing
 */
export async function findDueTasks(): Promise<ScheduledTask[]> {
  const now = new Date()
  return db
    .select()
    .from(scheduledTasks)
    .where(and(lte(scheduledTasks.nextRun, now), eq(scheduledTasks.status, 'active')))
    .all()
}

/**
 * Update a task after execution (set lastRun, calculate nextRun, update status)
 * @internal Exported for testing
 */
export async function updateTaskAfterRun(
  taskId: number,
  scheduleType: 'cron' | 'interval' | 'once',
  scheduleValue: string,
): Promise<void> {
  const nextRun = calculateNextRun(scheduleType, scheduleValue)

  await db
    .update(scheduledTasks)
    .set({
      lastRun: new Date(),
      nextRun,
      status: nextRun ? 'active' : 'completed',
    })
    .where(eq(scheduledTasks.id, taskId))
}

/**
 * Pause a task by ID (simple DB operation, no ownership check)
 * @internal Exported for testing
 */
export async function pauseTask(taskId: number): Promise<void> {
  await db.update(scheduledTasks).set({ status: 'paused' }).where(eq(scheduledTasks.id, taskId))
}

/**
 * Resume a paused task (recalculates nextRun)
 * @internal Exported for testing
 */
export async function resumeTask(taskId: number, task: ScheduledTask): Promise<void> {
  const nextRun = calculateNextRun(
    task.scheduleType as 'cron' | 'interval' | 'once',
    task.scheduleValue,
  )
  await db
    .update(scheduledTasks)
    .set({ status: 'active', nextRun })
    .where(eq(scheduledTasks.id, taskId))
}

/**
 * Cancel and delete a task
 * @internal Exported for testing
 */
export async function cancelTask(taskId: number): Promise<void> {
  await db.delete(scheduledTasks).where(eq(scheduledTasks.id, taskId))
}
