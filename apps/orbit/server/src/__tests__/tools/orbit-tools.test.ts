/**
 * BDD Tests for Orbit Tools
 *
 * Tests agent capability tools including:
 * - schedule_task: Schedule recurring/one-time tasks
 * - send_to_agent: Send messages to other agents
 * - list_tasks: List scheduled tasks
 * - pause_task: Pause a task
 * - resume_task: Resume a paused task
 * - cancel_task: Delete a task
 */

import { describe, it, expect, beforeEach } from 'bun:test'

import { agents, type Agent } from '@db/agents'
import { agentInbox } from '@db/inbox'
import { scheduledTasks } from '@db/tasks'
import { eq } from 'drizzle-orm'

import { db } from '@/core/db'
import { createOrbitTools, type OrbitToolHandler } from '@/modules/agents/tools/orbit-tools'

import { clearAllTables } from '../helpers/test-db'

// Helper to create test agents directly in DB
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

// Helper to create tool handlers for an agent
function createHandlers(agentName: string, agentId: number): OrbitToolHandler {
  const { handleToolCall } = createOrbitTools(agentName, agentId)

  return {
    schedule_task: args => handleToolCall('schedule_task', args, ''),
    send_to_agent: args => handleToolCall('send_to_agent', args, ''),
    list_tasks: () => handleToolCall('list_tasks', {}, ''),
    pause_task: args => handleToolCall('pause_task', args, ''),
    resume_task: args => handleToolCall('resume_task', args, ''),
    cancel_task: args => handleToolCall('cancel_task', args, ''),
  }
}

// ============================================================
// BDD Tests
// ============================================================

describe('Orbit Tools', () => {
  beforeEach(async () => {
    await clearAllTables()
  })

  // ----------------------------------------------------------
  // Feature: schedule_task Tool
  // ----------------------------------------------------------
  describe('Feature: schedule_task Tool', () => {
    describe('Scenario: Schedule an interval task', () => {
      it('Given an agent "scheduler-bot" exists', async () => {
        const agent = await createTestAgent('scheduler-bot')
        expect(agent.id).toBeGreaterThan(0)
      })

      it('When the agent schedules an hourly task', async () => {
        const agent = await createTestAgent('scheduler-bot')
        const handlers = createHandlers('scheduler-bot', agent.id)

        const result = await handlers.schedule_task({
          prompt: 'Check for updates',
          scheduleType: 'interval',
          scheduleValue: '3600000',
          name: 'Hourly Check',
        })

        expect(result).toContain('Task scheduled successfully')
      })

      it('Then the task should be created in database', async () => {
        const agent = await createTestAgent('scheduler-bot')
        const handlers = createHandlers('scheduler-bot', agent.id)

        await handlers.schedule_task({
          prompt: 'Check for updates',
          scheduleType: 'interval',
          scheduleValue: '3600000',
          name: 'Hourly Check',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        expect(tasks.length).toBe(1)
        expect(tasks[0]!.name).toBe('Hourly Check')
        expect(tasks[0]!.scheduleType).toBe('interval')
      })

      it('And nextRun should be approximately 1 hour from now', async () => {
        const agent = await createTestAgent('scheduler-bot')
        const handlers = createHandlers('scheduler-bot', agent.id)

        const before = Date.now()
        await handlers.schedule_task({
          prompt: 'Check for updates',
          scheduleType: 'interval',
          scheduleValue: '3600000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        const nextRun = tasks[0]!.nextRun!.getTime()
        expect(nextRun).toBeGreaterThanOrEqual(before + 3600000 - 1000)
      })
    })

    describe('Scenario: Schedule a cron task', () => {
      it('Given an agent exists', async () => {
        await createTestAgent('cron-bot')
      })

      it('When scheduling a daily 9am task', async () => {
        const agent = await createTestAgent('cron-bot')
        const handlers = createHandlers('cron-bot', agent.id)

        const result = await handlers.schedule_task({
          prompt: 'Good morning briefing',
          scheduleType: 'cron',
          scheduleValue: '0 9 * * *',
          name: 'Morning Briefing',
        })

        expect(result).toContain('Task scheduled successfully')
      })

      it('Then the task should have cron schedule type', async () => {
        const agent = await createTestAgent('cron-bot')
        const handlers = createHandlers('cron-bot', agent.id)

        await handlers.schedule_task({
          prompt: 'Good morning briefing',
          scheduleType: 'cron',
          scheduleValue: '0 9 * * *',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        expect(tasks[0]!.scheduleType).toBe('cron')
        expect(tasks[0]!.scheduleValue).toBe('0 9 * * *')
      })
    })

    describe('Scenario: Schedule a one-time task', () => {
      it('Given an agent exists', async () => {
        await createTestAgent('once-bot')
      })

      it('When scheduling a one-time task', async () => {
        const agent = await createTestAgent('once-bot')
        const handlers = createHandlers('once-bot', agent.id)

        const futureTime = new Date(Date.now() + 86400000).toISOString()
        const result = await handlers.schedule_task({
          prompt: 'Send reminder',
          scheduleType: 'once',
          scheduleValue: futureTime,
          name: 'One-time Reminder',
        })

        expect(result).toContain('Task scheduled successfully')
      })
    })

    describe('Scenario: Schedule with context mode', () => {
      it('Given an agent exists', async () => {
        await createTestAgent('context-bot')
      })

      it('When scheduling with main context mode', async () => {
        const agent = await createTestAgent('context-bot')
        const handlers = createHandlers('context-bot', agent.id)

        await handlers.schedule_task({
          prompt: 'Continue conversation',
          scheduleType: 'interval',
          scheduleValue: '60000',
          contextMode: 'main',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        expect(tasks[0]!.contextMode).toBe('main')
      })
    })

    describe('Scenario: Fail to schedule with invalid cron', () => {
      it('Given an agent exists', async () => {
        await createTestAgent('invalid-cron-bot')
      })

      it('When scheduling with invalid cron expression', async () => {
        const agent = await createTestAgent('invalid-cron-bot')
        const handlers = createHandlers('invalid-cron-bot', agent.id)

        const result = await handlers.schedule_task({
          prompt: 'This will fail',
          scheduleType: 'cron',
          scheduleValue: 'invalid-cron',
        })

        expect(result).toContain('Error')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: send_to_agent Tool
  // ----------------------------------------------------------
  describe('Feature: send_to_agent Tool', () => {
    describe('Scenario: Send message to another agent', () => {
      it('Given two agents "alice" and "bob" exist', async () => {
        await createTestAgent('alice')
        await createTestAgent('bob')
      })

      it('When alice sends a message to bob', async () => {
        const alice = await createTestAgent('alice')
        await createTestAgent('bob')

        const handlers = createHandlers('alice', alice.id)
        const result = await handlers.send_to_agent({
          targetAgent: 'bob',
          message: 'Hello Bob!',
        })

        expect(result).toContain('Message sent to bob')
      })

      it('Then the message should appear in bob inbox', async () => {
        const alice = await createTestAgent('alice')
        const bob = await createTestAgent('bob')

        const handlers = createHandlers('alice', alice.id)
        await handlers.send_to_agent({
          targetAgent: 'bob',
          message: 'Hello Bob!',
        })

        const inbox = await db
          .select()
          .from(agentInbox)
          .where(eq(agentInbox.toAgentId, bob.id))
          .all()

        expect(inbox.length).toBe(1)
        expect(inbox[0]!.message).toBe('Hello Bob!')
        expect(inbox[0]!.messageType).toBe('request')
      })
    })

    describe('Scenario: Send response message', () => {
      it('Given alice sent a request to bob', async () => {
        const alice = await createTestAgent('alice')
        await createTestAgent('bob')

        const aliceHandlers = createHandlers('alice', alice.id)
        await aliceHandlers.send_to_agent({
          targetAgent: 'bob',
          message: 'What is 2+2?',
        })
      })

      it('When bob sends a response back', async () => {
        await createTestAgent('alice')
        const bob = await createTestAgent('bob')

        const bobHandlers = createHandlers('bob', bob.id)
        const result = await bobHandlers.send_to_agent({
          targetAgent: 'alice',
          message: 'The answer is 4',
          messageType: 'response',
        })

        expect(result).toContain('Message sent to alice')
      })

      it('Then the message type should be response', async () => {
        const alice = await createTestAgent('alice')
        const bob = await createTestAgent('bob')

        const bobHandlers = createHandlers('bob', bob.id)
        await bobHandlers.send_to_agent({
          targetAgent: 'alice',
          message: 'The answer is 4',
          messageType: 'response',
        })

        const inbox = await db
          .select()
          .from(agentInbox)
          .where(eq(agentInbox.toAgentId, alice.id))
          .all()

        expect(inbox[0]!.messageType).toBe('response')
      })
    })

    describe('Scenario: Fail to send to non-existent agent', () => {
      it('Given only "sender" agent exists', async () => {
        await createTestAgent('sender')
      })

      it('When sender tries to message non-existent agent', async () => {
        const sender = await createTestAgent('sender')
        const handlers = createHandlers('sender', sender.id)

        const result = await handlers.send_to_agent({
          targetAgent: 'ghost',
          message: 'Hello?',
        })

        expect(result).toContain('Error')
        expect(result).toContain('ghost')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: list_tasks Tool
  // ----------------------------------------------------------
  describe('Feature: list_tasks Tool', () => {
    describe('Scenario: List tasks when tasks exist', () => {
      it('Given an agent has scheduled tasks', async () => {
        const agent = await createTestAgent('task-lister')
        const handlers = createHandlers('task-lister', agent.id)

        await handlers.schedule_task({
          prompt: 'Task 1',
          scheduleType: 'interval',
          scheduleValue: '60000',
          name: 'First Task',
        })

        await handlers.schedule_task({
          prompt: 'Task 2',
          scheduleType: 'cron',
          scheduleValue: '0 9 * * *',
          name: 'Second Task',
        })
      })

      it('When listing tasks', async () => {
        const agent = await createTestAgent('task-lister')
        const handlers = createHandlers('task-lister', agent.id)

        await handlers.schedule_task({
          prompt: 'Task 1',
          scheduleType: 'interval',
          scheduleValue: '60000',
          name: 'First Task',
        })

        await handlers.schedule_task({
          prompt: 'Task 2',
          scheduleType: 'cron',
          scheduleValue: '0 9 * * *',
          name: 'Second Task',
        })

        const result = await handlers.list_tasks()
        expect(result).toContain('Scheduled tasks:')
      })

      it('Then all tasks should be listed', async () => {
        const agent = await createTestAgent('task-lister')
        const handlers = createHandlers('task-lister', agent.id)

        await handlers.schedule_task({
          prompt: 'Task 1',
          scheduleType: 'interval',
          scheduleValue: '60000',
          name: 'First Task',
        })

        await handlers.schedule_task({
          prompt: 'Task 2',
          scheduleType: 'cron',
          scheduleValue: '0 9 * * *',
          name: 'Second Task',
        })

        const result = await handlers.list_tasks()
        expect(result).toContain('First Task')
        expect(result).toContain('Second Task')
        expect(result).toContain('interval')
        expect(result).toContain('cron')
      })
    })

    describe('Scenario: List tasks when no tasks exist', () => {
      it('Given an agent has no tasks', async () => {
        await createTestAgent('no-task-agent')
      })

      it('When listing tasks', async () => {
        const agent = await createTestAgent('no-task-agent')
        const handlers = createHandlers('no-task-agent', agent.id)

        const result = await handlers.list_tasks()
        expect(result).toBe('No scheduled tasks found.')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: pause_task Tool
  // ----------------------------------------------------------
  describe('Feature: pause_task Tool', () => {
    describe('Scenario: Pause own task', () => {
      it('Given an agent has an active task', async () => {
        const agent = await createTestAgent('pauser')
        const handlers = createHandlers('pauser', agent.id)

        await handlers.schedule_task({
          prompt: 'Pausable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })
      })

      it('When the agent pauses the task', async () => {
        const agent = await createTestAgent('pauser')
        const handlers = createHandlers('pauser', agent.id)

        await handlers.schedule_task({
          prompt: 'Pausable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        const result = await handlers.pause_task({ taskId: tasks[0]!.id })
        expect(result).toContain('paused')
      })

      it('Then the task status should be paused', async () => {
        const agent = await createTestAgent('pauser')
        const handlers = createHandlers('pauser', agent.id)

        await handlers.schedule_task({
          prompt: 'Pausable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        await handlers.pause_task({ taskId: tasks[0]!.id })

        const updated = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.id, tasks[0]!.id))
          .get()

        expect(updated!.status).toBe('paused')
      })
    })

    describe('Scenario: Fail to pause another agent task', () => {
      it('Given agent "alice" has a task', async () => {
        const alice = await createTestAgent('alice')
        const aliceHandlers = createHandlers('alice', alice.id)

        await aliceHandlers.schedule_task({
          prompt: 'Alice task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })
      })

      it('When "bob" tries to pause alice task', async () => {
        const alice = await createTestAgent('alice')
        const bob = await createTestAgent('bob')

        const aliceHandlers = createHandlers('alice', alice.id)
        await aliceHandlers.schedule_task({
          prompt: 'Alice task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, alice.id))
          .all()

        const bobHandlers = createHandlers('bob', bob.id)
        const result = await bobHandlers.pause_task({ taskId: tasks[0]!.id })

        expect(result).toContain('does not belong to this agent')
      })
    })

    describe('Scenario: Fail to pause non-existent task', () => {
      it('Given a task ID that does not exist', async () => {
        const agent = await createTestAgent('pauser')
        const handlers = createHandlers('pauser', agent.id)

        const result = await handlers.pause_task({ taskId: 99999 })
        expect(result).toContain('not found')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: resume_task Tool
  // ----------------------------------------------------------
  describe('Feature: resume_task Tool', () => {
    describe('Scenario: Resume a paused task', () => {
      it('Given an agent has a paused task', async () => {
        const agent = await createTestAgent('resumer')
        const handlers = createHandlers('resumer', agent.id)

        await handlers.schedule_task({
          prompt: 'Resumable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        await handlers.pause_task({ taskId: tasks[0]!.id })
      })

      it('When the agent resumes the task', async () => {
        const agent = await createTestAgent('resumer')
        const handlers = createHandlers('resumer', agent.id)

        await handlers.schedule_task({
          prompt: 'Resumable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        await handlers.pause_task({ taskId: tasks[0]!.id })
        const result = await handlers.resume_task({ taskId: tasks[0]!.id })

        expect(result).toContain('resumed')
      })

      it('Then the task status should be active', async () => {
        const agent = await createTestAgent('resumer')
        const handlers = createHandlers('resumer', agent.id)

        await handlers.schedule_task({
          prompt: 'Resumable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        await handlers.pause_task({ taskId: tasks[0]!.id })
        await handlers.resume_task({ taskId: tasks[0]!.id })

        const updated = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.id, tasks[0]!.id))
          .get()

        expect(updated!.status).toBe('active')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: cancel_task Tool
  // ----------------------------------------------------------
  describe('Feature: cancel_task Tool', () => {
    describe('Scenario: Cancel own task', () => {
      it('Given an agent has a task', async () => {
        const agent = await createTestAgent('canceller')
        const handlers = createHandlers('canceller', agent.id)

        await handlers.schedule_task({
          prompt: 'Cancellable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })
      })

      it('When the agent cancels the task', async () => {
        const agent = await createTestAgent('canceller')
        const handlers = createHandlers('canceller', agent.id)

        await handlers.schedule_task({
          prompt: 'Cancellable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        const result = await handlers.cancel_task({ taskId: tasks[0]!.id })
        expect(result).toContain('cancelled and deleted')
      })

      it('Then the task should be removed from database', async () => {
        const agent = await createTestAgent('canceller')
        const handlers = createHandlers('canceller', agent.id)

        await handlers.schedule_task({
          prompt: 'Cancellable task',
          scheduleType: 'interval',
          scheduleValue: '60000',
        })

        const tasks = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        await handlers.cancel_task({ taskId: tasks[0]!.id })

        const remaining = await db
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.agentId, agent.id))
          .all()

        expect(remaining.length).toBe(0)
      })
    })
  })
})
