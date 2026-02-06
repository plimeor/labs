import { existsSync } from 'fs'
import { join } from 'path'

import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'

export interface CreateTaskParams {
  prompt: string
  scheduleType: 'cron' | 'interval' | 'once'
  scheduleValue: string
  contextMode: 'isolated' | 'main'
  name?: string
}

export interface TaskData {
  id: string
  agentName: string
  name: string | null
  prompt: string
  scheduleType: 'cron' | 'interval' | 'once'
  scheduleValue: string
  contextMode: 'isolated' | 'main'
  status: 'active' | 'paused' | 'completed'
  nextRun: string | null
  lastRun: string | null
  createdAt: string
}

export interface DueTask {
  agentName: string
  task: TaskData
  filePath: string
}

export interface TaskRunData {
  id?: string
  taskId: string
  status: 'success' | 'error'
  result?: string
  error?: string
  startedAt: string
  completedAt?: string
  durationMs?: number
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class TaskStore {
  private readonly agentsPath: string

  constructor(private readonly basePath: string) {
    this.agentsPath = join(basePath, 'agents')
  }

  private tasksDir(agentName: string): string {
    return join(this.agentsPath, agentName, 'tasks')
  }

  private taskPath(agentName: string, taskId: string): string {
    return join(this.tasksDir(agentName), `${taskId}.json`)
  }

  private runsDir(agentName: string): string {
    return join(this.tasksDir(agentName), 'runs')
  }

  async create(agentName: string, params: CreateTaskParams): Promise<TaskData> {
    const id = generateId()
    const task: TaskData = {
      id,
      agentName,
      name: params.name ?? null,
      prompt: params.prompt,
      scheduleType: params.scheduleType,
      scheduleValue: params.scheduleValue,
      contextMode: params.contextMode,
      status: 'active',
      nextRun: null,
      lastRun: null,
      createdAt: new Date().toISOString(),
    }

    await mkdir(this.tasksDir(agentName), { recursive: true })
    await writeFile(this.taskPath(agentName, id), JSON.stringify(task, null, 2))
    return task
  }

  async get(agentName: string, taskId: string): Promise<TaskData | undefined> {
    const path = this.taskPath(agentName, taskId)
    if (!existsSync(path)) return undefined
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as TaskData
  }

  async listByAgent(agentName: string): Promise<TaskData[]> {
    const dir = this.tasksDir(agentName)
    if (!existsSync(dir)) return []

    const entries = await readdir(dir)
    const jsonFiles = entries.filter(entry => entry.endsWith('.json'))

    const tasks = await Promise.all(
      jsonFiles.map(async file => {
        const content = await readFile(join(dir, file), 'utf-8')
        return JSON.parse(content) as TaskData
      }),
    )

    return tasks
  }

  async update(agentName: string, taskId: string, updates: Partial<TaskData>): Promise<TaskData> {
    const task = await this.get(agentName, taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)

    const updated = { ...task, ...updates }
    await writeFile(this.taskPath(agentName, taskId), JSON.stringify(updated, null, 2))
    return updated
  }

  async delete(agentName: string, taskId: string): Promise<void> {
    const path = this.taskPath(agentName, taskId)
    if (!existsSync(path)) throw new Error(`Task not found: ${taskId}`)
    await rm(path)
  }

  async findDueTasks(): Promise<DueTask[]> {
    if (!existsSync(this.agentsPath)) return []

    const agentDirs = await readdir(this.agentsPath, { withFileTypes: true })
    const now = new Date()

    const agentTaskLists = await Promise.all(
      agentDirs
        .filter(dir => dir.isDirectory())
        .map(async agentDir => {
          const tasks = await this.listByAgent(agentDir.name)
          return tasks
            .filter(
              task => task.status === 'active' && task.nextRun && new Date(task.nextRun) <= now,
            )
            .map(task => ({
              agentName: agentDir.name,
              task,
              filePath: this.taskPath(agentDir.name, task.id),
            }))
        }),
    )

    return agentTaskLists.flat()
  }

  async writeRun(agentName: string, run: TaskRunData): Promise<void> {
    const id = run.id ?? generateId()
    const dir = this.runsDir(agentName)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${id}.json`), JSON.stringify({ ...run, id }, null, 2))
  }
}
