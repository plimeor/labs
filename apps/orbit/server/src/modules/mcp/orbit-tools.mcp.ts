import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

import type { InboxStore } from '@/stores/inbox.store'
import type { TaskStore } from '@/stores/task.store'
import { calculateNextRun } from '@/utils/schedule'

export interface OrbitMcpDeps {
  taskStore: TaskStore
  inboxStore: InboxStore
}

export function createOrbitMcpServer(agentName: string, deps: OrbitMcpDeps) {
  const { taskStore, inboxStore } = deps

  return createSdkMcpServer({
    name: 'orbit-tools',
    version: '1.0.0',
    tools: [
      tool(
        'schedule_task',
        `Schedule a recurring or one-time task.

CONTEXT MODE:
- "isolated": Fresh session (include all context in prompt)
- "main": Main session with chat history

SCHEDULE TYPE:
- "cron": Cron expression (e.g., "0 9 * * *" for 9am daily)
- "interval": Milliseconds (e.g., "3600000" for hourly)
- "once": ISO timestamp (e.g., "2026-02-03T15:30:00Z")`,
        {
          prompt: z.string().describe('The task prompt to execute'),
          scheduleType: z.enum(['cron', 'interval', 'once']).describe('Type of schedule'),
          scheduleValue: z.string().describe('Cron expression, milliseconds, or ISO timestamp'),
          contextMode: z.enum(['isolated', 'main']).default('isolated').describe('Session context mode'),
          name: z.string().optional().describe('Human-readable task name')
        },
        async args => {
          const nextRun = calculateNextRun(args.scheduleType, args.scheduleValue)
          if (!nextRun) {
            return {
              content: [
                { type: 'text' as const, text: 'Error: Could not calculate next run time. Check your schedule value.' }
              ]
            }
          }

          const task = await taskStore.create(agentName, {
            prompt: args.prompt,
            scheduleType: args.scheduleType,
            scheduleValue: args.scheduleValue,
            contextMode: args.contextMode,
            name: args.name,
            nextRun
          })

          return {
            content: [
              {
                type: 'text' as const,
                text: `Task scheduled successfully (ID: ${task.id}). Next run: ${nextRun}`
              }
            ]
          }
        }
      ),

      tool(
        'send_to_agent',
        'Send a message to another agent. The message will appear in their inbox on their next session.',
        {
          targetAgent: z.string().describe('Name of the target agent'),
          message: z.string().describe('Message content'),
          messageType: z.enum(['request', 'response']).default('request').describe('Type of message')
        },
        async args => {
          const msg = await inboxStore.send({
            fromAgent: agentName,
            toAgent: args.targetAgent,
            message: args.message,
            messageType: args.messageType
          })

          return {
            content: [
              {
                type: 'text' as const,
                text: `Message sent to ${args.targetAgent} (ID: ${msg.id})`
              }
            ]
          }
        }
      ),

      tool('list_tasks', 'List all scheduled tasks for this agent.', {}, async () => {
        const tasks = await taskStore.listByAgent(agentName)

        if (tasks.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] }
        }

        const taskList = tasks.map(t => {
          const nextRunStr = t.nextRun ?? 'N/A'
          return `- ID: ${t.id} | ${t.name || 'Unnamed'} | ${t.scheduleType} | Status: ${t.status} | Next: ${nextRunStr}`
        })

        return {
          content: [{ type: 'text' as const, text: `Scheduled tasks:\n${taskList.join('\n')}` }]
        }
      }),

      tool(
        'pause_task',
        'Pause a scheduled task by ID.',
        { taskId: z.string().describe('Task ID to pause') },
        async args => {
          const task = await taskStore.get(agentName, args.taskId)
          if (!task) {
            return {
              content: [{ type: 'text' as const, text: `Error: Task ${args.taskId} not found` }]
            }
          }

          await taskStore.update(agentName, args.taskId, { status: 'paused' })
          return { content: [{ type: 'text' as const, text: `Task ${args.taskId} paused` }] }
        }
      ),

      tool(
        'resume_task',
        'Resume a paused task by ID.',
        { taskId: z.string().describe('Task ID to resume') },
        async args => {
          const task = await taskStore.get(agentName, args.taskId)
          if (!task) {
            return {
              content: [{ type: 'text' as const, text: `Error: Task ${args.taskId} not found` }]
            }
          }

          const nextRun = calculateNextRun(task.scheduleType, task.scheduleValue)
          await taskStore.update(agentName, args.taskId, {
            status: 'active',
            nextRun: nextRun ?? null
          })

          return {
            content: [
              {
                type: 'text' as const,
                text: `Task ${args.taskId} resumed. Next run: ${nextRun ?? 'N/A'}`
              }
            ]
          }
        }
      ),

      tool(
        'cancel_task',
        'Cancel and delete a scheduled task by ID.',
        { taskId: z.string().describe('Task ID to cancel') },
        async args => {
          const task = await taskStore.get(agentName, args.taskId)
          if (!task) {
            return {
              content: [{ type: 'text' as const, text: `Error: Task ${args.taskId} not found` }]
            }
          }

          await taskStore.delete(agentName, args.taskId)
          return {
            content: [{ type: 'text' as const, text: `Task ${args.taskId} cancelled and deleted` }]
          }
        }
      )
    ]
  })
}
