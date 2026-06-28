import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import type { McpServerResource } from '../types'
import type { McpExtensionDriver } from './extensions'
import { mcpServerRecord } from './extensions'

type CodexMcpProof = {
  fingerprint: string
}

export function createCodexMcpDriver(configFile: string): McpExtensionDriver {
  return {
    configFile,
    async canReclaimOnInstall({ extension, installed, name }) {
      const entry = codexMcpServerEntry(await readTextFile(configFile), name)
      const proof = entry ? codexMcpServerProof(entry, name) : undefined
      if (!extension.resources.mcpServers?.[name] || !proof) {
        return false
      }

      // code-lean: marker migration relies on recorded server state, upgrade when pre-server state must migrate.
      return installed.server !== undefined && proof.fingerprint === codexMcpServerFingerprint(name, installed.server)
    },
    async currentFingerprint(name: string) {
      const entry = codexMcpServerEntry(await readTextFile(configFile), name)
      return entry ? codexMcpServerProof(entry, name)?.fingerprint : undefined
    },
    async install({ name, server }) {
      const current = await readTextFile(configFile)
      const entry = codexMcpEntry(name, server)
      const next = `${removeCodexMcpServerEntry(current, name).trimEnd()}\n\n${entry}\n`
      await writeTextFile(configFile, next)
      const proof = codexMcpServerProof(entry, name)
      if (!proof) {
        throw new Error(`Codex MCP server ${name} proof could not be generated.`)
      }
      return { fingerprint: proof.fingerprint, name, server: mcpServerRecord(server) }
    },
    async remove(name: string) {
      const current = await readTextFile(configFile)
      await writeTextFile(configFile, `${removeCodexMcpServerEntry(current, name).trimEnd()}\n`)
    }
  }
}

function codexMcpEntry(name: string, server: McpServerResource): string {
  const lines = [
    `[mcp_servers.${tomlKey(name)}]`,
    `command = ${tomlString(server.command)}`,
    `args = ${tomlArray(server.args ?? [])}`
  ]

  const env = server.env ?? {}
  if (Object.keys(env).length > 0) {
    lines.push('', `[mcp_servers.${tomlKey(name)}.env]`)
    for (const [key, value] of Object.entries(env)) {
      lines.push(`${tomlKey(key)} = ${tomlString(value)}`)
    }
  }

  return lines.join('\n')
}

function removeCodexMcpServerEntry(config: string, name: string): string {
  const kept: string[] = []
  let inOwnedTable = false
  let inLegacyBlock = false
  let lookingForDisplacedMarker = false

  for (const line of config.split('\n')) {
    if (line === codexLegacyBeginMarker(name)) {
      inLegacyBlock = true
      inOwnedTable = false
      continue
    }

    if (line === codexLegacyEndMarker(name)) {
      inLegacyBlock = false
      inOwnedTable = false
      continue
    }

    if (codexExtensionId(line) !== undefined && (inOwnedTable || inLegacyBlock || lookingForDisplacedMarker)) {
      inOwnedTable = false
      lookingForDisplacedMarker = false
      continue
    }

    const tableName = tomlTableName(line)
    if (tableName !== undefined) {
      const wasInOwnedTable = inOwnedTable
      inOwnedTable = isCodexMcpServerTableName(tableName, name)
      if (inOwnedTable) {
        lookingForDisplacedMarker = true
      } else if (lookingForDisplacedMarker && wasInOwnedTable) {
        lookingForDisplacedMarker = !isCodexMcpServerNamespace(tableName)
      } else if (lookingForDisplacedMarker && isCodexMcpServerNamespace(tableName)) {
        lookingForDisplacedMarker = false
      }
    }

    if (inOwnedTable) {
      continue
    }

    kept.push(line)
  }

  return kept.join('\n')
}

function codexMcpServerEntry(config: string, name: string): string | undefined {
  const lines = config.split('\n')
  const legacyEntry: string[] = []
  let inLegacyBlock = false

  for (const line of lines) {
    if (line === codexLegacyBeginMarker(name)) {
      inLegacyBlock = true
      legacyEntry.push(line)
      continue
    }

    if (inLegacyBlock) {
      legacyEntry.push(line)
      if (line === codexLegacyEndMarker(name)) {
        return legacyEntry.join('\n')
      }
    }
  }

  const entry: string[] = []
  let inEntry = false

  for (const line of lines) {
    const tableName = tomlTableName(line)
    if (tableName !== undefined) {
      const isOwnedTable = isCodexMcpServerTableName(tableName, name)

      if (!inEntry && isOwnedTable) {
        inEntry = true
        entry.push(line)
        continue
      }

      if (inEntry && !isOwnedTable) {
        break
      }
    }

    if (inEntry) {
      entry.push(line)
      if (codexExtensionId(line) !== undefined) {
        break
      }
    }
  }

  return entry.length > 0 ? entry.join('\n') : undefined
}

function codexMcpServerProof(entry: string, name: string): CodexMcpProof | undefined {
  const proofLines: string[] = []
  let inOwnedTable = false
  let sawOwnedTable = false

  for (const line of entry.split('\n')) {
    if (line === codexLegacyBeginMarker(name) || line === codexLegacyEndMarker(name)) {
      inOwnedTable = false
      continue
    }

    const markerExtensionId = codexExtensionId(line)
    if (markerExtensionId !== undefined) {
      inOwnedTable = false
      continue
    }

    const tableName = tomlTableName(line)
    if (tableName !== undefined) {
      inOwnedTable = isCodexMcpServerTableName(tableName, name)
      sawOwnedTable = sawOwnedTable || inOwnedTable
    }

    if (inOwnedTable) {
      if (lineContributesToCodexMcpFingerprint(line)) {
        proofLines.push(line)
      }
    }
  }

  if (!sawOwnedTable) {
    return undefined
  }

  return {
    fingerprint: textFingerprint(proofLines.join('\n'))
  }
}

function codexMcpServerFingerprint(name: string, server: McpServerResource): string {
  return codexMcpServerProof(codexMcpEntry(name, server), name)?.fingerprint ?? ''
}

function codexLegacyBeginMarker(name: string): string {
  return `# @plimeor/harness begin mcpServers ${name}`
}

function codexLegacyEndMarker(name: string): string {
  return `# @plimeor/harness end mcpServers ${name}`
}

function codexExtensionId(line: string): string | undefined {
  return line.match(/^# @plimeor\/harness extension = (.*)$/)?.[1]
}

// code-lean: line-based scan for Codex MCP entries, upgrade when Codex TOML writes need arbitrary table edits.
function tomlTableName(line: string): string | undefined {
  return line.match(/^\s*\[(.*)]\s*(?:#.*)?$/)?.[1]
}

function lineContributesToCodexMcpFingerprint(line: string): boolean {
  const trimmed = line.trim()
  return trimmed !== '' && !trimmed.startsWith('#')
}

function isCodexMcpServerTableName(tableName: string, serverName: string): boolean {
  const tableNames = new Set([`mcp_servers.${serverName}`, `mcp_servers.${tomlKey(serverName)}`])

  for (const owned of tableNames) {
    if (tableName === owned || tableName.startsWith(`${owned}.`)) {
      return true
    }
  }

  return false
}

function isCodexMcpServerNamespace(tableName: string): boolean {
  return tableName === 'mcp_servers' || tableName.startsWith('mcp_servers.')
}

function tomlKey(value: string): string {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : tomlString(value)
}

function tomlArray(values: string[]): string {
  return `[${values.map(tomlString).join(', ')}]`
}

function tomlString(value: string): string {
  return JSON.stringify(value)
}

function textFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) {
      return ''
    }
    throw error
  }
}

async function writeTextFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFileAtomically(path, text)
}

async function writeFileAtomically(path: string, text: string): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temporaryPath, text)
  try {
    await rename(temporaryPath, path)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
