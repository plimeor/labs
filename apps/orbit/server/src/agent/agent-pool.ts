import { OrbitAgent, type OrbitAgentDeps } from './orbit-agent'

export class AgentPool {
  private agents: Map<string, OrbitAgent> = new Map()
  private lastAccess: Map<string, number> = new Map()
  private evictionTimer?: ReturnType<typeof setInterval>
  private deps: OrbitAgentDeps

  constructor(deps: OrbitAgentDeps) {
    this.deps = deps
  }

  async get(name: string): Promise<OrbitAgent> {
    let agent = this.agents.get(name)
    if (!agent) {
      agent = new OrbitAgent(name, this.deps)
      this.agents.set(name, agent)
    }
    this.lastAccess.set(name, Date.now())
    return agent
  }

  release(name: string): void {
    const agent = this.agents.get(name)
    if (agent) {
      agent.abort()
      this.agents.delete(name)
      this.lastAccess.delete(name)
    }
  }

  startEviction(ttlMs: number = 10 * 60 * 1000): void {
    this.evictionTimer = setInterval(() => {
      const now = Date.now()
      for (const [name, lastAccess] of this.lastAccess.entries()) {
        if (now - lastAccess > ttlMs) {
          this.release(name)
        }
      }
    }, ttlMs / 2)
  }

  stopEviction(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer)
      this.evictionTimer = undefined
    }
  }

  has(name: string): boolean {
    return this.agents.has(name)
  }

  size(): number {
    return this.agents.size
  }
}
