/**
 * BDD Tests for Scheduler Service
 *
 * Tests task scheduling operations including:
 * - Finding due tasks
 * - Calculating next run times
 * - Task execution lifecycle
 * - Cron expression parsing
 * - Interval-based scheduling
 * - One-time task completion
 */

import { describe, it, expect, beforeEach } from 'bun:test'

import { agents, type Agent } from '@db/agents'
import { scheduledTasks, type ScheduledTask, type NewScheduledTask } from '@db/tasks'
import { eq } from 'drizzle-orm'

import { db } from '@/core/db'
import {
  calculateNextRun,
  findDueTasks,
  updateTaskAfterRun,
  pauseTask,
  resumeTask,
  cancelTask,
} from '@/modules/scheduler/scheduler-utils'

import { clearAllTables } from '../helpers/test-db'

// Helper to create test agent
async function createTestAgent(name: string): Promise<Agent> {
  const result = await db
    .insert(agents)
    .values({
      name,
      workspacePath: `/tmp/orbit/agents/${name}`,
      status: 'active',
    })
    .returning()
  return result[0]!
}

// Helper to create test task
async function createTestTask(
  agentId: number,
  overrides: Partial<NewScheduledTask> = {},
): Promise<ScheduledTask> {
  const result = await db
    .insert(scheduledTasks)
    .values({
      agentId,
      name: 'Test Task',
      prompt: 'Do something',
      scheduleType: 'interval',
      scheduleValue: '3600000', // 1 hour
      contextMode: 'isolated',
      status: 'active',
      nextRun: new Date(Date.now() + 3600000),
      ...overrides,
    })
    .returning()
  return result[0]!
}

// ============================================================
// BDD Tests
// ============================================================

describe('Scheduler Service', () => {
  beforeEach(async () => {
    await clearAllTables()
  })

  // ----------------------------------------------------------
  // Feature: Calculate Next Run Time
  // ----------------------------------------------------------
  describe('Feature: Calculate Next Run Time', () => {
    it('should calculate next run for cron at 9am', () => {
      const nextRun = calculateNextRun('cron', '0 9 * * *')

      expect(nextRun).toBeDefined()
      expect(nextRun!.getTime()).toBeGreaterThan(Date.now())
      expect(nextRun!.getHours()).toBe(9)
      expect(nextRun!.getMinutes()).toBe(0)
    })

    it('should calculate next run for interval (1 hour)', () => {
      const before = Date.now()
      const nextRun = calculateNextRun('interval', '3600000')
      const after = Date.now()

      expect(nextRun).toBeDefined()
      expect(nextRun!.getTime()).toBeGreaterThanOrEqual(before + 3600000)
      expect(nextRun!.getTime()).toBeLessThanOrEqual(after + 3600000)
    })

    it('should return exact timestamp for one-time task', () => {
      const nextRun = calculateNextRun('once', '2026-02-10T15:30:00Z')
      expect(nextRun!.toISOString()).toBe('2026-02-10T15:30:00.000Z')
    })

    it('should return undefined for invalid cron expression', () => {
      const nextRun = calculateNextRun('cron', 'not-a-cron')
      expect(nextRun).toBeUndefined()
    })

    it('should return undefined for invalid interval', () => {
      const nextRun = calculateNextRun('interval', 'not-a-number')
      expect(nextRun).toBeUndefined()
    })
  })

  // ----------------------------------------------------------
  // Feature: Find Due Tasks
  // ----------------------------------------------------------
  describe('Feature: Find Due Tasks', () => {
    it('should find only due tasks excluding future ones', async () => {
      const agent = await createTestAgent('worker')
      await createTestTask(agent.id, {
        name: 'Due Task',
        nextRun: new Date(Date.now() - 60000),
      })
      await createTestTask(agent.id, {
        name: 'Future Task',
        nextRun: new Date(Date.now() + 3600000),
      })

      const dueTasks = await findDueTasks()

      expect(dueTasks.length).toBe(1)
      expect(dueTasks[0]!.name).toBe('Due Task')
    })

    it('should exclude paused tasks', async () => {
      const agent = await createTestAgent('worker')
      await createTestTask(agent.id, {
        name: 'Paused Task',
        nextRun: new Date(Date.now() - 60000),
        status: 'paused',
      })

      const dueTasks = await findDueTasks()
      expect(dueTasks).toEqual([])
    })

    it('should exclude completed tasks', async () => {
      const agent = await createTestAgent('worker')
      await createTestTask(agent.id, {
        name: 'Completed Task',
        nextRun: null,
        status: 'completed',
      })

      const dueTasks = await findDueTasks()
      expect(dueTasks.length).toBe(0)
    })

    it('should find all due tasks when multiple exist', async () => {
      const agent = await createTestAgent('worker')
      await createTestTask(agent.id, { name: 'Due Task 1', nextRun: new Date(Date.now() - 60000) })
      await createTestTask(agent.id, { name: 'Due Task 2', nextRun: new Date(Date.now() - 30000) })
      await createTestTask(agent.id, { name: 'Due Task 3', nextRun: new Date(Date.now() - 10000) })

      const dueTasks = await findDueTasks()
      const names = dueTasks.map(t => t.name)

      expect(dueTasks.length).toBe(3)
      expect(names).toContain('Due Task 1')
      expect(names).toContain('Due Task 2')
      expect(names).toContain('Due Task 3')
    })
  })

  // ----------------------------------------------------------
  // Feature: Update Task After Run
  // ----------------------------------------------------------
  describe('Feature: Update Task After Run', () => {
    it('should update interval task with lastRun, nextRun and active status', async () => {
      const agent = await createTestAgent('worker')
      const task = await createTestTask(agent.id, {
        scheduleType: 'interval',
        scheduleValue: '60000',
      })
      const before = Date.now()

      await updateTaskAfterRun(task.id, 'interval', '60000')

      const updated = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, task.id))
        .get()
      expect(updated!.lastRun!.getTime()).toBeGreaterThanOrEqual(before - 1000)
      expect(updated!.nextRun!.getTime()).toBeGreaterThanOrEqual(before + 60000 - 1000)
      expect(updated!.status).toBe('active')
    })

    it('should record lastRun for one-time task after execution', async () => {
      const agent = await createTestAgent('worker')
      const pastTime = new Date(Date.now() - 86400000).toISOString()
      const task = await createTestTask(agent.id, {
        scheduleType: 'once',
        scheduleValue: pastTime,
      })

      await updateTaskAfterRun(task.id, 'once', pastTime)

      const updated = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, task.id))
        .get()
      expect(updated!.lastRun).toBeDefined()
    })
  })

  // ----------------------------------------------------------
  // Feature: Pause and Resume Tasks
  // ----------------------------------------------------------
  describe('Feature: Pause and Resume Tasks', () => {
    it('should pause an active task', async () => {
      const agent = await createTestAgent('worker')
      const task = await createTestTask(agent.id)

      await pauseTask(task.id)

      const updated = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, task.id))
        .get()
      expect(updated!.status).toBe('paused')
    })

    it('should resume a paused task with recalculated nextRun', async () => {
      const agent = await createTestAgent('worker')
      const task = await createTestTask(agent.id, {
        scheduleType: 'interval',
        scheduleValue: '60000',
      })
      await pauseTask(task.id)
      const before = Date.now()

      const paused = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, task.id))
        .get()
      await resumeTask(task.id, paused!)

      const updated = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, task.id))
        .get()
      expect(updated!.status).toBe('active')
      expect(updated!.nextRun!.getTime()).toBeGreaterThanOrEqual(before + 60000 - 1000)
    })
  })

  // ----------------------------------------------------------
  // Feature: Cancel Tasks
  // ----------------------------------------------------------
  describe('Feature: Cancel Tasks', () => {
    it('should delete task from database when cancelled', async () => {
      const agent = await createTestAgent('worker')
      const task = await createTestTask(agent.id)

      await cancelTask(task.id)

      const deleted = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, task.id))
        .get()
      expect(deleted).toBeUndefined()
    })
  })

  // ----------------------------------------------------------
  // Feature: Cron Expression Validation
  // ----------------------------------------------------------
  describe('Feature: Cron Expression Validation', () => {
    it.each([
      { expr: '* * * * *', desc: 'every minute' },
      { expr: '0 * * * *', desc: 'every hour' },
      { expr: '0 0 * * *', desc: 'every day at midnight' },
      { expr: '0 9 * * 1-5', desc: 'weekdays at 9am' },
      { expr: '0 0 1 * *', desc: 'first day of month' },
      { expr: '*/15 * * * *', desc: 'every 15 minutes' },
    ])('should parse cron expression "$expr" ($desc)', ({ expr }) => {
      const nextRun = calculateNextRun('cron', expr)
      expect(nextRun).toBeDefined()
      expect(nextRun!.getTime()).toBeGreaterThan(Date.now())
    })
  })
})
