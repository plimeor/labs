import { describe, it, expect } from 'bun:test'

import { createMemoryMcpServer } from '@/mcp/memory-tools.mcp'

describe('memory-tools MCP server', () => {
  it('should create MCP server with memory tools', () => {
    const server = createMemoryMcpServer('test-bot')
    expect(server).toBeDefined()
    expect(server.name).toBe('memory-tools')
  })
})
