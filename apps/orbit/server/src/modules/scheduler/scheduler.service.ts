import { type ScheduledTask, scheduledTasks } from '@db/tasks'
import { logger } from '@plimeor-labs/logger'
import { CronExpressionParser } from 'cron-parser'
import { and, eq, lte } from 'drizzle-orm'

import { db } from '@/core/db'

import { getAgentById } from '../agents/services/agent.service'
import { executeAgent } from '../agents/services/runtime.service'

const DEFAULT_POLL_INTERVAL = 30000 // 30 seconds

export class SchedulerService {
  private intervalId: ReturnType<typeof setInterval> | undefined
  private readonly pollInterval: number
  private isRunning = false

  constructor(pollInterval = DEFAULT_POLL_INTERVAL) {
    this.pollInterval = pollInterval
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Scheduler already running')
      return
    }

    logger.info(`Starting scheduler with ${this.pollInterval}ms poll interval`)
    this.intervalId = setInterval(() => this.tick(), this.pollInterval)

    // Execute immediately on start
    this.tick()
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
      logger.info('Scheduler stopped')
    }
  }

  private async tick(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Scheduler tick skipped - previous tick still running')
      return
    }

    this.isRunning = true

    try {
      // Find due tasks
      const now = new Date()
      const dueTasks = await db
        .select()
        .from(scheduledTasks)
        .where(and(lte(scheduledTasks.nextRun, now), eq(scheduledTasks.status, 'active')))
        .all()

      if (dueTasks.length > 0) {
        logger.info(`Found ${dueTasks.length} due task(s)`)
      }

      // Execute each task
      for (const task of dueTasks) {
        await this.runTask(task)
      }
    } catch (error) {
      logger.error('Scheduler tick error', { error })
    } finally {
      this.isRunning = false
    }
  }

  private async runTask(task: ScheduledTask): Promise<void> {
    // Get agent name from ID
    const agent = await getAgentById(task.agentId)
    if (!agent) {
      logger.error(`Agent not found for task ${task.id}`, { agentId: task.agentId })
      return
    }

    logger.info(`Executing task ${task.id}`, {
      agentName: agent.name,
      name: task.name,
      scheduleType: task.scheduleType
    })

    try {
      // Execute the agent
      await executeAgent({
        agentName: agent.name,
        prompt: task.prompt,
        sessionType: task.contextMode === 'main' ? 'chat' : 'cron',
        sessionId: task.contextMode === 'main' ? undefined : `cron-${task.id}`
      })

      // Calculate next run
      const nextRun = this.calculateNextRun(task)

      // Update task
      await db
        .update(scheduledTasks)
        .set({
          lastRun: new Date(),
          nextRun,
          status: nextRun ? 'active' : 'completed'
        })
        .where(eq(scheduledTasks.id, task.id))

      logger.info(`Task ${task.id} completed`, {
        nextRun: nextRun?.toISOString() || 'none'
      })
    } catch (error) {
      logger.error(`Task ${task.id} failed`, { error })
    }
  }

  private calculateNextRun(task: ScheduledTask): Date | undefined {
    if (task.scheduleType === 'cron') {
      try {
        const interval = CronExpressionParser.parse(task.scheduleValue)
        return interval.next().toDate()
      } catch {
        logger.error(`Invalid cron expression for task ${task.id}`, {
          value: task.scheduleValue
        })
        return undefined
      }
    } else if (task.scheduleType === 'interval') {
      const ms = parseInt(task.scheduleValue, 10)
      if (Number.isNaN(ms)) {
        logger.error(`Invalid interval for task ${task.id}`, {
          value: task.scheduleValue
        })
        return undefined
      }
      return new Date(Date.now() + ms)
    }

    // 'once' tasks don't have a next run
    return undefined
  }
}

// Singleton instance
let schedulerInstance: SchedulerService | undefined

export function getScheduler(): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService()
  }
  return schedulerInstance
}

export function startScheduler(): void {
  getScheduler().start()
}

export function stopScheduler(): void {
  getScheduler().stop()
}
