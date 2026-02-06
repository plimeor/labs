import { logger } from '@plimeor-labs/logger'
import { CronExpressionParser } from 'cron-parser'

import type { AgentPool } from '@/agent/agent-pool'
import type { TaskStore, TaskData } from '@/stores/task.store'

const DEFAULT_POLL_INTERVAL = 30000

export interface SchedulerDeps {
  taskStore: TaskStore
  agentPool: AgentPool
}

export class SchedulerService {
  private intervalId: ReturnType<typeof setInterval> | undefined
  private readonly pollInterval: number
  private isRunning = false
  private deps: SchedulerDeps

  constructor(deps: SchedulerDeps, pollInterval = DEFAULT_POLL_INTERVAL) {
    this.deps = deps
    this.pollInterval = pollInterval
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Scheduler already running')
      return
    }

    logger.info(`Starting scheduler with ${this.pollInterval}ms poll interval`)
    this.intervalId = setInterval(() => this.tick(), this.pollInterval)
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
      const dueTasks = await this.deps.taskStore.findDueTasks()

      if (dueTasks.length > 0) {
        logger.info(`Found ${dueTasks.length} due task(s)`)
      }

      for (const dueTask of dueTasks) {
        await this.runTask(dueTask.agentName, dueTask.task)
      }
    } catch (error) {
      logger.error('Scheduler tick error', { error })
    } finally {
      this.isRunning = false
    }
  }

  private async runTask(agentName: string, task: TaskData): Promise<void> {
    logger.info(`Executing task ${task.id}`, {
      agentName,
      name: task.name,
      scheduleType: task.scheduleType
    })

    const startedAt = new Date()

    try {
      const agent = await this.deps.agentPool.get(agentName)

      let result = ''
      for await (const message of agent.chat(task.prompt, {
        sessionType: task.contextMode === 'main' ? 'chat' : 'cron',
        sessionId: task.contextMode === 'main' ? undefined : `cron-${task.id}`,
      })) {
        if (message.type === 'result') {
          const resultMsg = message as unknown as { result?: string }
          result = resultMsg.result ?? ''
        }
      }

      // Write run record
      await this.deps.taskStore.writeRun(agentName, {
        taskId: task.id,
        status: 'success',
        result,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      })

      // Calculate next run
      const nextRun = this.calculateNextRun(task)

      await this.deps.taskStore.update(agentName, task.id, {
        lastRun: new Date().toISOString(),
        nextRun,
        status: nextRun ? 'active' : 'completed',
      })

      logger.info(`Task ${task.id} completed`, { nextRun: nextRun ?? 'none' })
    } catch (error) {
      logger.error(`Task ${task.id} failed`, { error })

      await this.deps.taskStore.writeRun(agentName, {
        taskId: task.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
      })
    }
  }

  private calculateNextRun(task: TaskData): string | undefined {
    if (task.scheduleType === 'cron') {
      try {
        const interval = CronExpressionParser.parse(task.scheduleValue)
        return interval.next().toDate().toISOString()
      } catch {
        logger.error(`Invalid cron expression for task ${task.id}`, { value: task.scheduleValue })
        return undefined
      }
    } else if (task.scheduleType === 'interval') {
      const ms = parseInt(task.scheduleValue, 10)
      if (isNaN(ms)) {
        logger.error(`Invalid interval for task ${task.id}`, { value: task.scheduleValue })
        return undefined
      }
      return new Date(Date.now() + ms).toISOString()
    }
    return undefined
  }
}

export function createSchedulerService(
  deps: SchedulerDeps,
  pollInterval?: number,
): SchedulerService {
  return new SchedulerService(deps, pollInterval)
}
