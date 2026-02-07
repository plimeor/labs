import { OrbitAgent, type OrbitAgentDeps } from './orbit-agent'

export class AgentPool {
  private agents: Map<string, OrbitAgent> = new Map()
  private lastAccess: Map<string, number> = new Map()
  private evictionTimer?: ReturnType<typeof setInterval>
  private deps: OrbitAgentDeps

  constructor(deps: OrbitAgentDeps) {
    this.deps = deps
  }

  private key(name: string, sessionId: string): string {
    return `${name}:${sessionId}`
  }

  async get(name: string, sessionId: string): Promise<OrbitAgent> {
    const k = this.key(name, sessionId)
    let agent = this.agents.get(k)
    if (!agent) {
      agent = new OrbitAgent(name, sessionId, this.deps)
      this.agents.set(k, agent)
    }
    this.lastAccess.set(k, Date.now())
    return agent
  }

  release(name: string, sessionId: string): void {
    const k = this.key(name, sessionId)
    const agent = this.agents.get(k)
    if (agent) {
      agent.abort()
      this.agents.delete(k)
      this.lastAccess.delete(k)
    }
  }

  startEviction(ttlMs: number = 10 * 60 * 1000): void {
    this.evictionTimer = setInterval(() => {
      const now = Date.now()
      for (const [k, lastAccess] of this.lastAccess.entries()) {
        if (now - lastAccess > ttlMs) {
          const agent = this.agents.get(k)
          if (agent) agent.abort()
          this.agents.delete(k)
          this.lastAccess.delete(k)
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

  has(name: string, sessionId: string): boolean {
    return this.agents.has(this.key(name, sessionId))
  }

  size(): number {
    return this.agents.size
  }
}
