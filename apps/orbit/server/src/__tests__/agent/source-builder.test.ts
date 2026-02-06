import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const TEST_CONFIG_PATH = '/tmp/orbit-source-test'

import { buildSourceServers } from '@/agent/source-builder'

describe('Source Builder', () => {
  beforeEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  afterEach(() => {
    rmSync(TEST_CONFIG_PATH, { recursive: true, force: true })
  })

  it('should return empty object if no sources directory', async () => {
    const servers = await buildSourceServers(TEST_CONFIG_PATH, 'test-bot')
    expect(Object.keys(servers)).toEqual([])
  })

  it('should build stdio MCP server config from source', async () => {
    const sourceDir = join(TEST_CONFIG_PATH, 'agents', 'test-bot', 'sources', 'github')
    mkdirSync(sourceDir, { recursive: true })

    writeFileSync(
      join(sourceDir, 'config.json'),
      JSON.stringify({
        type: 'mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: 'test-token' },
      }),
    )

    const servers = await buildSourceServers(TEST_CONFIG_PATH, 'test-bot')
    expect(servers['github']).toBeDefined()
    expect(servers['github']!.command).toBe('npx')
  })

  it('should build HTTP MCP server config from source', async () => {
    const sourceDir = join(TEST_CONFIG_PATH, 'agents', 'test-bot', 'sources', 'web-search')
    mkdirSync(sourceDir, { recursive: true })

    writeFileSync(
      join(sourceDir, 'config.json'),
      JSON.stringify({
        type: 'mcp',
        transport: 'http',
        url: 'https://mcp.example.com/search',
      }),
    )

    const servers = await buildSourceServers(TEST_CONFIG_PATH, 'test-bot')
    expect(servers['web-search']).toBeDefined()
    expect(servers['web-search']!.url).toBe('https://mcp.example.com/search')
  })
})
