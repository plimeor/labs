import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_PATH = '/tmp/orbit-taskstore-test'

import { TaskStore } from '@/stores/task.store'

describe('TaskStore', () => {
  let store: TaskStore
  const agentName = 'test-bot'

  beforeEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
    const tasksDir = join(TEST_CONFIG_PATH, 'agents', agentName, 'tasks', 'runs')
    mkdirSync(tasksDir, { recursive: true })
    store = new TaskStore(TEST_CONFIG_PATH)
  })

  afterEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  describe('create', () => {
    it('should create a task file and return task with id', async () => {
      const task = await store.create(agentName, {
        prompt: 'Check email',
        scheduleType: 'cron',
        scheduleValue: '0 9 * * *',
        contextMode: 'isolated',
      })

      expect(task.id).toBeDefined()
      expect(task.prompt).toBe('Check email')
      expect(task.status).toBe('active')
      expect(
        existsSync(join(TEST_CONFIG_PATH, 'agents', agentName, 'tasks', `${task.id}.json`)),
      ).toBe(true)
    })
  })

  describe('get', () => {
    it('should return task by id', async () => {
      const created = await store.create(agentName, {
        prompt: 'Check email',
        scheduleType: 'interval',
        scheduleValue: '3600000',
        contextMode: 'isolated',
      })

      const task = await store.get(agentName, created.id)
      expect(task).toBeDefined()
      expect(task!.prompt).toBe('Check email')
    })

    it('should return undefined for non-existent task', async () => {
      const task = await store.get(agentName, 'no-such-id')
      expect(task).toBeUndefined()
    })
  })

  describe('listByAgent', () => {
    it('should list all tasks for an agent', async () => {
      await store.create(agentName, {
        prompt: 'Task 1',
        scheduleType: 'interval',
        scheduleValue: '1000',
        contextMode: 'isolated',
      })
      await store.create(agentName, {
        prompt: 'Task 2',
        scheduleType: 'cron',
        scheduleValue: '0 9 * * *',
        contextMode: 'main',
      })

      const tasks = await store.listByAgent(agentName)
      expect(tasks.length).toBe(2)
    })
  })

  describe('update', () => {
    it('should update task status', async () => {
      const task = await store.create(agentName, {
        prompt: 'Task',
        scheduleType: 'interval',
        scheduleValue: '1000',
        contextMode: 'isolated',
      })

      await store.update(agentName, task.id, { status: 'paused' })
      const updated = await store.get(agentName, task.id)

      expect(updated!.status).toBe('paused')
    })
  })

  describe('delete', () => {
    it('should remove task file', async () => {
      const task = await store.create(agentName, {
        prompt: 'Task',
        scheduleType: 'interval',
        scheduleValue: '1000',
        contextMode: 'isolated',
      })

      await store.delete(agentName, task.id)
      expect(await store.get(agentName, task.id)).toBeUndefined()
    })
  })

  describe('findDueTasks', () => {
    it('should find tasks where nextRun <= now and status is active', async () => {
      const pastTask = await store.create(agentName, {
        prompt: 'Due task',
        scheduleType: 'interval',
        scheduleValue: '1000',
        contextMode: 'isolated',
      })
      await store.update(agentName, pastTask.id, {
        nextRun: new Date(Date.now() - 60000).toISOString(),
      })

      const futureTask = await store.create(agentName, {
        prompt: 'Future task',
        scheduleType: 'interval',
        scheduleValue: '9999999',
        contextMode: 'isolated',
      })
      await store.update(agentName, futureTask.id, {
        nextRun: new Date(Date.now() + 9999999).toISOString(),
      })

      const due = await store.findDueTasks()
      expect(due.length).toBe(1)
      expect(due[0]!.task.prompt).toBe('Due task')
      expect(due[0]!.agentName).toBe(agentName)
    })
  })

  describe('writeRun', () => {
    it('should create a run file', async () => {
      const task = await store.create(agentName, {
        prompt: 'Task',
        scheduleType: 'interval',
        scheduleValue: '1000',
        contextMode: 'isolated',
      })

      await store.writeRun(agentName, {
        taskId: task.id,
        status: 'success',
        result: 'Done',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 150,
      })

      const runsDir = join(TEST_CONFIG_PATH, 'agents', agentName, 'tasks', 'runs')
      const { readdir } = await import('fs/promises')
      const files = await readdir(runsDir)
      expect(files.length).toBe(1)
    })
  })
})
