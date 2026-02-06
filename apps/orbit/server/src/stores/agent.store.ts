import { existsSync } from 'fs'
import { join } from 'path'

import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'

export interface AgentMetadata {
  name: string
  status: 'active' | 'inactive'
  model?: string
  permissionMode?: 'safe' | 'ask' | 'allow-all'
  createdAt: string
  lastActiveAt: string | null
}

export interface CreateAgentParams {
  name: string
  description?: string
  model?: string
}

export class AgentStore {
  private readonly agentsPath: string

  constructor(private readonly basePath: string) {
    this.agentsPath = join(basePath, 'agents')
  }

  private agentDir(name: string): string {
    return join(this.agentsPath, name)
  }

  private agentJsonPath(name: string): string {
    return join(this.agentDir(name), 'agent.json')
  }

  async create(params: CreateAgentParams): Promise<AgentMetadata> {
    const dir = this.agentDir(params.name)
    if (existsSync(dir)) {
      throw new Error(`Agent already exists: ${params.name}`)
    }

    await mkdir(dir, { recursive: true })
    await mkdir(join(dir, 'memory'), { recursive: true })
    await mkdir(join(dir, 'workspace'), { recursive: true })
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await mkdir(join(dir, 'tasks'), { recursive: true })
    await mkdir(join(dir, 'tasks', 'runs'), { recursive: true })
    await mkdir(join(dir, 'inbox', 'pending'), { recursive: true })
    await mkdir(join(dir, 'inbox', 'archive'), { recursive: true })

    const metadata: AgentMetadata = {
      name: params.name,
      status: 'active',
      model: params.model,
      createdAt: new Date().toISOString(),
      lastActiveAt: null,
    }

    await writeFile(this.agentJsonPath(params.name), JSON.stringify(metadata, null, 2))
    return metadata
  }

  async get(name: string): Promise<AgentMetadata | undefined> {
    const path = this.agentJsonPath(name)
    if (!existsSync(path)) {
      return undefined
    }
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as AgentMetadata
  }

  async list(): Promise<AgentMetadata[]> {
    if (!existsSync(this.agentsPath)) {
      return []
    }

    const entries = await readdir(this.agentsPath, { withFileTypes: true })
    const agents: AgentMetadata[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agent = await this.get(entry.name)
        if (agent) agents.push(agent)
      }
    }

    return agents
  }

  async update(name: string, updates: Partial<AgentMetadata>): Promise<AgentMetadata> {
    const agent = await this.get(name)
    if (!agent) {
      throw new Error(`Agent not found: ${name}`)
    }

    const updated = { ...agent, ...updates }
    await writeFile(this.agentJsonPath(name), JSON.stringify(updated, null, 2))
    return updated
  }

  async updateLastActive(name: string): Promise<void> {
    await this.update(name, { lastActiveAt: new Date().toISOString() })
  }

  async delete(name: string): Promise<void> {
    const dir = this.agentDir(name)
    if (!existsSync(dir)) {
      throw new Error(`Agent not found: ${name}`)
    }
    await rm(dir, { recursive: true })
  }

  async exists(name: string): Promise<boolean> {
    return existsSync(this.agentDir(name))
  }

  async ensure(name: string): Promise<AgentMetadata> {
    const existing = await this.get(name)
    if (existing) return existing
    return this.create({ name })
  }

  getAgentDir(name: string): string {
    return this.agentDir(name)
  }

  getWorkingDir(name: string): string {
    return join(this.agentDir(name), 'workspace')
  }
}
