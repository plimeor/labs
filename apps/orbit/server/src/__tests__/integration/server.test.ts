import { describe, expect, it } from 'bun:test'

describe('Server Integration', () => {
  it('should import stores without errors', async () => {
    const { AgentStore } = await import('@/stores/agent.store')
    const { TaskStore } = await import('@/stores/task.store')
    const { InboxStore } = await import('@/stores/inbox.store')
    const { SessionStore } = await import('@/stores/session.store')

    expect(AgentStore).toBeDefined()
    expect(TaskStore).toBeDefined()
    expect(InboxStore).toBeDefined()
    expect(SessionStore).toBeDefined()
  })

  it('should import OrbitAgent without errors', async () => {
    const { OrbitAgent } = await import('@/modules/agent/orbit-agent')
    expect(OrbitAgent).toBeDefined()
  })

  it('should import MCP servers without errors', async () => {
    const { createOrbitMcpServer } = await import('@/modules/mcp/orbit-tools.mcp')
    const { createMemoryMcpServer } = await import('@/modules/mcp/memory-tools.mcp')

    expect(createOrbitMcpServer).toBeDefined()
    expect(createMemoryMcpServer).toBeDefined()
  })

  it('should import permission hook without errors', async () => {
    const { createPermissionHook } = await import('@/modules/agent/permissions')
    expect(createPermissionHook).toBeDefined()
  })

  it('should import source builder without errors', async () => {
    const { buildSourceServers } = await import('@/modules/agent/source-builder')
    expect(buildSourceServers).toBeDefined()
  })
})
