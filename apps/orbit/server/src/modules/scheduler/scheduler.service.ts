import { logger } from '@plimeor-labs/logger'

import type { AgentPool } from '@/modules/agent'
import type { SessionStore } from '@/stores/session.store'
import type { TaskData, TaskStore } from '@/stores/task.store'
import { calculateNextRun } from '@/utils/schedule'
import { extractResultText } from '@/utils/sdk'

const DEFAULT_POLL_INTERVAL = 30000

export interface SchedulerDeps {
  taskStore: TaskStore
  sessionStore: SessionStore
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
      // Create fresh session for this task execution
      const session = await this.deps.sessionStore.create(agentName, {})

      const agent = await this.deps.agentPool.get(agentName, session.id)

      let result = ''
      for await (const message of agent.chat(task.prompt, {
        sessionType: task.contextMode === 'main' ? 'chat' : 'cron',
        sessionId: session.id
      })) {
        const text = extractResultText(message)
        if (text !== undefined) result = text
      }

      // Store messages in the session
      await this.deps.sessionStore.appendConversation(agentName, session.id, task.prompt, result)

      // Write run record
      await this.deps.taskStore.writeRun(agentName, {
        taskId: task.id,
        status: 'success',
        result,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime()
      })

      // Calculate next run using shared utility
      const nextRun = calculateNextRun(task.scheduleType, task.scheduleValue)

      await this.deps.taskStore.update(agentName, task.id, {
        lastRun: new Date().toISOString(),
        nextRun,
        status: nextRun ? 'active' : 'completed'
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
        durationMs: Date.now() - startedAt.getTime()
      })
    }
  }
}

export function createSchedulerService(deps: SchedulerDeps, pollInterval?: number): SchedulerService {
  return new SchedulerService(deps, pollInterval)
}
