import { unlink } from 'fs/promises'
import { homedir } from 'os'
import { resolve } from 'path'

import { logger } from '@plimeor-labs/logger'
import { $ } from 'bun'

import { getQmdConfig } from '@/core/config/qmd.config'

import { getAgentWorkspacePath } from './workspace.service'

/** QMD availability status (checked once at startup) */
let qmdAvailable: boolean | undefined

/**
 * Check if QMD is installed and available
 * Called once at server startup, result is cached
 */
export async function checkQmdAvailability(): Promise<boolean> {
  if (qmdAvailable !== undefined) {
    return qmdAvailable
  }

  try {
    const result = await $`which qmd`.quiet()
    qmdAvailable = result.exitCode === 0
  } catch {
    qmdAvailable = false
  }

  if (!qmdAvailable) {
    logger.warn('╔════════════════════════════════════════════════════════════╗')
    logger.warn('║  QMD is not installed. Memory search features are disabled.║')
    logger.warn('║                                                            ║')
    logger.warn('║  To enable memory search, install QMD:                     ║')
    logger.warn('║  bun install -g https://github.com/tobi/qmd                ║')
    logger.warn('╚════════════════════════════════════════════════════════════╝')
  } else {
    logger.info('QMD detected, memory search features enabled')
  }

  return qmdAvailable
}

/**
 * Check if QMD is available (sync, uses cached result)
 */
export function isQmdAvailable(): boolean {
  return qmdAvailable ?? false
}

export interface SearchResult {
  docid: string
  path: string
  score: number
  title: string
  snippet: string
  lines?: { start: number; end: number }
}

interface SearchOptions {
  agentName: string
  maxResults?: number
}

/**
 * Get the QMD index path for an agent
 */
function getIndexPath(agentName: string): string {
  const workspace = getAgentWorkspacePath(agentName)
  return resolve(workspace, 'qmd.sqlite')
}

/**
 * Initialize QMD collection for an agent
 * Called when agent is created or on first search
 *
 * @throws Error if QMD is not available - caller must check isQmdAvailable() first
 */
export async function initializeIndex(agentName: string): Promise<void> {
  if (!isQmdAvailable()) {
    throw new Error('QMD is not available')
  }

  const workspace = getAgentWorkspacePath(agentName)
  const indexPath = getIndexPath(agentName)
  const config = await getQmdConfig()

  // Check existing collections
  const collectionsResult = await $`INDEX_PATH=${indexPath} qmd collection list --format json`.json()
  const existingCollections = new Set(
    (collectionsResult as Array<{ name: string }>).map((c) => c.name),
  )

  // Add default collections
  const memoryPath = resolve(workspace, 'memory')
  const workspacePath = resolve(workspace, 'workspace')

  if (!existingCollections.has('memory')) {
    await $`INDEX_PATH=${indexPath} qmd collection add ${memoryPath} --name memory`.quiet()
  }
  if (!existingCollections.has('workspace')) {
    await $`INDEX_PATH=${indexPath} qmd collection add ${workspacePath} --name workspace`.quiet()
  }

  // Add extra collections from config (sequential execution required)
  const extraCollections = config.collections[agentName] ?? []
  for (const [i, dir] of extraCollections.entries()) {
    const collectionName = `extra-${i}`
    if (!existingCollections.has(collectionName)) {
      const expandedDir = dir.replace(/^~/, homedir())
      // eslint-disable-next-line no-await-in-loop -- sequential execution required for qmd commands
      await $`INDEX_PATH=${indexPath} qmd collection add ${expandedDir} --name ${collectionName}`.quiet()
    }
  }

  // Add context for better retrieval
  await $`INDEX_PATH=${indexPath} qmd context add "qmd://memory" "Agent daily memories and long-term notes"`.quiet()
  await $`INDEX_PATH=${indexPath} qmd context add "qmd://workspace" "Files and documents created by the agent"`.quiet()

  // Generate initial embeddings
  await $`INDEX_PATH=${indexPath} qmd embed`.quiet()

  logger.info(`QMD index initialized for agent: ${agentName}`)
}

/**
 * Update index when memory files change
 * Called after memory write operations
 *
 * @throws Error if QMD is not available - caller must check isQmdAvailable() first
 */
export async function updateIndex(agentName: string): Promise<void> {
  const indexPath = getIndexPath(agentName)

  try {
    await $`INDEX_PATH=${indexPath} qmd update`.quiet()
    await $`INDEX_PATH=${indexPath} qmd embed`.quiet()
  } catch (error) {
    logger.warn(`Failed to update QMD index for agent ${agentName}`, { error })
  }
}

/**
 * Search agent's memory using QMD hybrid search
 *
 * @throws Error if QMD is not available - caller must check isQmdAvailable() first
 */
export async function search(options: SearchOptions, query: string): Promise<SearchResult[]> {
  const indexPath = getIndexPath(options.agentName)
  const maxResults = options.maxResults ?? 6

  try {
    // Use 'query' command for hybrid search with reranking
    const result =
      await $`INDEX_PATH=${indexPath} qmd query ${query} --limit ${maxResults} --format json`.json()

    return (result as unknown[]).map((item: unknown) => {
      const record = item as Record<string, unknown>
      return {
        docid: String(record.docid ?? ''),
        path: String(record.path ?? ''),
        score: Number(record.score ?? 0),
        title: String(record.title ?? ''),
        snippet: String(record.snippet ?? ''),
        lines: record.lines as { start: number; end: number } | undefined,
      }
    })
  } catch (error) {
    logger.warn(`QMD search failed for agent ${options.agentName}`, { error })
    return []
  }
}

/**
 * Get full document content
 *
 * @throws Error if QMD is not available - caller must check isQmdAvailable() first
 */
export async function getDocument(
  agentName: string,
  path: string,
  options?: { from?: number; lines?: number },
): Promise<string> {
  const indexPath = getIndexPath(agentName)

  try {
    const args: string[] = ['get', path]
    if (options?.from) {
      args.push('--from', String(options.from))
    }
    if (options?.lines) {
      args.push('--lines', String(options.lines))
    }

    const result = await $`INDEX_PATH=${indexPath} qmd ${args}`.text()
    return result
  } catch (error) {
    logger.warn(`Failed to get document ${path} for agent ${agentName}`, { error })
    return ''
  }
}

/**
 * Check if index exists for agent
 */
export async function indexExists(agentName: string): Promise<boolean> {
  const indexPath = getIndexPath(agentName)
  const file = Bun.file(indexPath)
  return file.exists()
}

/**
 * Delete index for agent (used when agent is deleted)
 */
export async function deleteIndex(agentName: string): Promise<void> {
  const indexPath = getIndexPath(agentName)

  try {
    const file = Bun.file(indexPath)
    if (await file.exists()) {
      await unlink(indexPath)
      logger.info(`QMD index deleted for agent: ${agentName}`)
    }
  } catch (error) {
    logger.warn(`Failed to delete QMD index for agent ${agentName}`, { error })
  }
}
