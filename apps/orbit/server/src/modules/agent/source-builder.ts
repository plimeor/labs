import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

interface StdioSourceConfig {
  type: 'mcp'
  transport: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

interface HttpSourceConfig {
  type: 'mcp'
  transport: 'http' | 'sse'
  url: string
  headers?: Record<string, string>
}

type SourceConfig = StdioSourceConfig | HttpSourceConfig

interface McpServerConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export async function buildSourceServers(
  basePath: string,
  agentName: string
): Promise<Record<string, McpServerConfig>> {
  const sourcesDir = join(basePath, 'agents', agentName, 'sources')
  if (!existsSync(sourcesDir)) return {}

  const entries = await readdir(sourcesDir, { withFileTypes: true })
  const servers: Record<string, McpServerConfig> = {}

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const configPath = join(sourcesDir, entry.name, 'config.json')
    if (!existsSync(configPath)) continue

    const raw = await readFile(configPath, 'utf-8')
    const config = JSON.parse(raw) as SourceConfig

    if (config.transport === 'stdio') {
      const stdioConfig = config as StdioSourceConfig
      servers[entry.name] = {
        command: stdioConfig.command,
        args: stdioConfig.args,
        env: stdioConfig.env
      }
    } else if (config.transport === 'http' || config.transport === 'sse') {
      const httpConfig = config as HttpSourceConfig
      servers[entry.name] = {
        url: httpConfig.url,
        headers: httpConfig.headers
      }
    }
  }

  return servers
}
