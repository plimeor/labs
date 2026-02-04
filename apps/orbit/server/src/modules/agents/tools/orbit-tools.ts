import type Anthropic from '@anthropic-ai/sdk'
import { scheduledTasks, type NewScheduledTask } from '@db/tasks'
import { CronExpressionParser } from 'cron-parser'
import { eq } from 'drizzle-orm'

import { db } from '@/core/db'

import { sendToAgentByName } from '../services/inbox.service'

// Tool definitions for Anthropic API
export const orbitToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'schedule_task',
    description: `Schedule a recurring or one-time task.

CONTEXT MODE:
• "isolated": Fresh session (include all context in prompt)
• "main": Main session with chat history

SCHEDULE TYPE:
• "cron": Cron expression (e.g., "0 9 * * *" for 9am daily)
• "interval": Milliseconds (e.g., "3600000" for hourly)
• "once": ISO timestamp (e.g., "2026-02-03T15:30:00Z")`,
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The task prompt to execute',
        },
        scheduleType: {
          type: 'string',
          enum: ['cron', 'interval', 'once'],
          description: 'Type of schedule',
        },
        scheduleValue: {
          type: 'string',
          description: 'Cron expression, milliseconds, or ISO timestamp',
        },
        contextMode: {
          type: 'string',
          enum: ['isolated', 'main'],
          default: 'isolated',
          description: 'Session context mode',
        },
        name: {
          type: 'string',
          description: 'Human-readable task name',
        },
      },
      required: ['prompt', 'scheduleType', 'scheduleValue'],
    },
  },
  {
    name: 'send_to_agent',
    description:
      'Send a message to another agent. The message will appear in their inbox on their next session.',
    input_schema: {
      type: 'object',
      properties: {
        targetAgent: {
          type: 'string',
          description: 'Name of the target agent',
        },
        message: {
          type: 'string',
          description: 'Message content',
        },
        messageType: {
          type: 'string',
          enum: ['request', 'response'],
          default: 'request',
          description: 'Type of message',
        },
      },
      required: ['targetAgent', 'message'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List all scheduled tasks for this agent.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'pause_task',
    description: 'Pause a scheduled task by ID.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'number',
          description: 'Task ID to pause',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'resume_task',
    description: 'Resume a paused task by ID.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'number',
          description: 'Task ID to resume',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'cancel_task',
    description: 'Cancel and delete a scheduled task by ID.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'number',
          description: 'Task ID to cancel',
        },
      },
      required: ['taskId'],
    },
  },
]

// Tool handler interface
export interface OrbitToolHandler {
  schedule_task: (args: {
    prompt: string
    scheduleType: 'cron' | 'interval' | 'once'
    scheduleValue: string
    contextMode?: 'isolated' | 'main'
    name?: string
  }) => Promise<string>
  send_to_agent: (args: {
    targetAgent: string
    message: string
    messageType?: 'request' | 'response'
  }) => Promise<string>
  list_tasks: () => Promise<string>
  pause_task: (args: { taskId: number }) => Promise<string>
  resume_task: (args: { taskId: number }) => Promise<string>
  cancel_task: (args: { taskId: number }) => Promise<string>
}

function calculateNextRun(
  scheduleType: 'cron' | 'interval' | 'once',
  scheduleValue: string,
): Date | undefined {
  if (scheduleType === 'cron') {
    const interval = CronExpressionParser.parse(scheduleValue)
    return interval.next().toDate()
  } else if (scheduleType === 'interval') {
    const ms = parseInt(scheduleValue, 10)
    return new Date(Date.now() + ms)
  } else if (scheduleType === 'once') {
    return new Date(scheduleValue)
  }
  return undefined
}

export function createOrbitTools(agentName: string, agentId: number) {
  const handlers: OrbitToolHandler = {
    async schedule_task(args) {
      const { prompt, scheduleType, scheduleValue, contextMode = 'isolated', name } = args

      const nextRun = calculateNextRun(scheduleType, scheduleValue)
      if (!nextRun) {
        return 'Error: Could not calculate next run time'
      }

      const newTask: NewScheduledTask = {
        agentId,
        name,
        prompt,
        scheduleType,
        scheduleValue,
        contextMode,
        status: 'active',
        nextRun,
      }

      const result = await db.insert(scheduledTasks).values(newTask).returning()
      const task = result[0]!

      return `Task scheduled successfully (ID: ${task.id}). Next run: ${nextRun.toISOString()}`
    },

    async send_to_agent(args) {
      const { targetAgent, message, messageType = 'request' } = args

      const result = await sendToAgentByName(agentName, targetAgent, message, messageType)

      return `Message sent to ${targetAgent} (ID: ${result.id})`
    },

    async list_tasks() {
      const tasks = await db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.agentId, agentId))
        .all()

      if (tasks.length === 0) {
        return 'No scheduled tasks found.'
      }

      const taskList = tasks.map(t => {
        const nextRunStr = t.nextRun ? t.nextRun.toISOString() : 'N/A'
        return `- ID: ${t.id} | ${t.name || 'Unnamed'} | ${t.scheduleType} | Status: ${t.status} | Next: ${nextRunStr}`
      })

      return `Scheduled tasks:\n${taskList.join('\n')}`
    },

    async pause_task(args) {
      const { taskId } = args

      const task = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, taskId)).get()

      if (!task) {
        return `Error: Task ${taskId} not found`
      }

      if (task.agentId !== agentId) {
        return `Error: Task ${taskId} does not belong to this agent`
      }

      await db.update(scheduledTasks).set({ status: 'paused' }).where(eq(scheduledTasks.id, taskId))

      return `Task ${taskId} paused`
    },

    async resume_task(args) {
      const { taskId } = args

      const task = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, taskId)).get()

      if (!task) {
        return `Error: Task ${taskId} not found`
      }

      if (task.agentId !== agentId) {
        return `Error: Task ${taskId} does not belong to this agent`
      }

      // Recalculate next run
      const nextRun = calculateNextRun(
        task.scheduleType as 'cron' | 'interval' | 'once',
        task.scheduleValue,
      )

      await db
        .update(scheduledTasks)
        .set({ status: 'active', nextRun })
        .where(eq(scheduledTasks.id, taskId))

      return `Task ${taskId} resumed. Next run: ${nextRun?.toISOString() || 'N/A'}`
    },

    async cancel_task(args) {
      const { taskId } = args

      const task = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, taskId)).get()

      if (!task) {
        return `Error: Task ${taskId} not found`
      }

      if (task.agentId !== agentId) {
        return `Error: Task ${taskId} does not belong to this agent`
      }

      await db.delete(scheduledTasks).where(eq(scheduledTasks.id, taskId))

      return `Task ${taskId} cancelled and deleted`
    },
  }

  async function handleToolCall(
    toolName: keyof OrbitToolHandler,
    args: Record<string, unknown>,
    _workingDir: string,
  ): Promise<string> {
    const handler = handlers[toolName]
    if (!handler) {
      return `Unknown tool: ${toolName}`
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (handler as any)(args)
    } catch (error) {
      return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  return {
    tools: orbitToolDefinitions,
    handleToolCall,
  }
}
