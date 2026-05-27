import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  stat as readStat,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { $ } from 'bun'

export type ClaudifyOptions = {
  cwd?: string
}

export type ClaudifyResult = {
  claudeDirectoriesCreated: string[]
  claudeFilesDeleted: string[]
  claudeFilesKept: string[]
  claudeLinksCreated: string[]
  claudeFilesUpdated: string[]
  root: string
  skillLinksCreated: string[]
  skillLinksKept: string[]
}

const skippedDirectoryNames = new Set(['.agent', '.claude', '.git', 'dist', 'node_modules'])
const agentsFileName = 'AGENTS.md'
const claudeFileContent = '@AGENTS.md\n'
const claudeFileLinkTarget = agentsFileName
const claudeFileName = 'CLAUDE.md'
const skillsLinkTarget = '../.agent/skills'

export async function claudify(options: ClaudifyOptions = {}): Promise<ClaudifyResult> {
  const root = await resolveGitRoot(options.cwd ?? process.cwd())
  const result: ClaudifyResult = {
    claudeDirectoriesCreated: [],
    claudeFilesDeleted: [],
    claudeFilesKept: [],
    claudeFilesUpdated: [],
    claudeLinksCreated: [],
    root,
    skillLinksCreated: [],
    skillLinksKept: []
  }

  await scanDirectory(root, result)
  return result
}

async function resolveGitRoot(cwd: string): Promise<string> {
  return $`git rev-parse --show-toplevel`
    .cwd(cwd)
    .quiet()
    .text()
    .then(output => output.trim())
}

export function formatClaudifyResult(result: ClaudifyResult): string {
  const createdCount =
    result.claudeDirectoriesCreated.length + result.claudeLinksCreated.length + result.skillLinksCreated.length
  const changedCount = createdCount + result.claudeFilesDeleted.length + result.claudeFilesUpdated.length
  if (changedCount === 0) {
    return `No changes needed in ${result.root}`
  }

  return [
    `Claudified ${result.root}`,
    `Created .claude directories: ${result.claudeDirectoriesCreated.length}`,
    `Created .claude/skills links: ${result.skillLinksCreated.length}`,
    `Created CLAUDE.md links: ${result.claudeLinksCreated.length}`,
    `Updated CLAUDE.md files: ${result.claudeFilesUpdated.length}`,
    `Deleted CLAUDE.md files: ${result.claudeFilesDeleted.length}`
  ].join('\n')
}

async function scanDirectory(directory: string, result: ClaudifyResult): Promise<void> {
  const entries = await readSortedDirectory(directory)
  const hasAgentsFile = hasFile(entries, agentsFileName)

  if (await hasAgentSkillsDirectory(directory)) {
    await ensureClaudeSkillsLink(directory, result)
  }

  await syncClaudeFile(directory, hasAgentsFile, result)

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    if (skippedDirectoryNames.has(entry.name)) {
      continue
    }

    await scanDirectory(join(directory, entry.name), result)
  }
}

async function readSortedDirectory(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

async function hasAgentSkillsDirectory(directory: string): Promise<boolean> {
  try {
    const stats = await readStat(join(directory, '.agent', 'skills'))
    return stats.isDirectory()
  } catch (error) {
    if (isMissingPath(error)) {
      return false
    }

    throw error
  }
}

function hasFile(entries: Awaited<ReturnType<typeof readSortedDirectory>>, name: string): boolean {
  const entry = entries.find(item => item.name === name)
  return entry?.isFile() ?? false
}

async function ensureClaudeSkillsLink(directory: string, result: ClaudifyResult): Promise<void> {
  const claudeDir = join(directory, '.claude')
  if (await ensureDirectory(claudeDir)) {
    result.claudeDirectoriesCreated.push(claudeDir)
  }

  const linkPath = join(claudeDir, 'skills')
  const linkState = await inspectSkillsLink(linkPath)
  if (linkState === 'missing') {
    await symlink(skillsLinkTarget, linkPath, 'dir')
    result.skillLinksCreated.push(linkPath)
    return
  }

  if (linkState === 'matching') {
    result.skillLinksKept.push(linkPath)
    return
  }

  throw new Error(linkState.reason)
}

async function ensureDirectory(directory: string): Promise<boolean> {
  try {
    const stats = await lstat(directory)
    if (stats.isDirectory()) {
      return false
    }

    throw new Error(`Cannot create directory because a non-directory path already exists: ${directory}`)
  } catch (error) {
    if (!isMissingPath(error)) {
      throw error
    }
  }

  await mkdir(directory)
  return true
}

async function inspectSkillsLink(
  linkPath: string
): Promise<'matching' | 'missing' | { reason: string; state: 'conflict' }> {
  let stats: Awaited<ReturnType<typeof lstat>>
  try {
    stats = await lstat(linkPath)
  } catch (error) {
    if (isMissingPath(error)) {
      return 'missing'
    }

    throw error
  }

  if (!stats.isSymbolicLink()) {
    return {
      reason: `Cannot create symlink because path already exists: ${linkPath}`,
      state: 'conflict'
    }
  }

  const actualTarget = resolveSymlinkTarget(linkPath, await readlink(linkPath))
  const expectedTarget = resolveSymlinkTarget(linkPath, skillsLinkTarget)
  if (actualTarget === expectedTarget) {
    return 'matching'
  }

  return {
    reason: `Cannot create symlink because ${linkPath} points to ${actualTarget}`,
    state: 'conflict'
  }
}

async function syncClaudeFile(directory: string, hasAgentsFile: boolean, result: ClaudifyResult): Promise<void> {
  const claudeFile = join(directory, claudeFileName)
  try {
    const stats = await lstat(claudeFile)
    if (stats.isDirectory()) {
      if (hasAgentsFile) {
        throw new Error(`Cannot create CLAUDE.md because a directory already exists: ${claudeFile}`)
      }

      return
    }

    if (!hasAgentsFile && stats.isSymbolicLink() && (await isDanglingSymlink(claudeFile))) {
      await unlink(claudeFile)
      result.claudeFilesDeleted.push(claudeFile)
      return
    }

    if (hasAgentsFile && stats.isSymbolicLink() && (await pointsToAgentsFile(claudeFile))) {
      result.claudeFilesKept.push(claudeFile)
      return
    }

    const content = await readFile(claudeFile, 'utf8')
    if (hasAgentsFile) {
      await ensureClaudeFileReferencesAgents(claudeFile, content, result)
      return
    }

    await removeStaleAgentsReference(claudeFile, content, result)
    return
  } catch (error) {
    if (!isMissingPath(error)) {
      throw error
    }
  }

  if (!hasAgentsFile) {
    return
  }

  await symlink(claudeFileLinkTarget, claudeFile, 'file')
  result.claudeLinksCreated.push(claudeFile)
}

async function ensureClaudeFileReferencesAgents(
  claudeFile: string,
  content: string,
  result: ClaudifyResult
): Promise<void> {
  if (hasAgentsReference(content)) {
    result.claudeFilesKept.push(claudeFile)
    return
  }

  await writeFile(claudeFile, `${claudeFileContent}${content}`, 'utf8')
  result.claudeFilesUpdated.push(claudeFile)
}

async function removeStaleAgentsReference(claudeFile: string, content: string, result: ClaudifyResult): Promise<void> {
  if (!hasAgentsReference(content)) {
    result.claudeFilesKept.push(claudeFile)
    return
  }

  const nextContent = removeAgentsReference(content)
  if (nextContent.trim() === '') {
    await unlink(claudeFile)
    result.claudeFilesDeleted.push(claudeFile)
    return
  }

  await writeFile(claudeFile, nextContent, 'utf8')
  result.claudeFilesUpdated.push(claudeFile)
}

function hasAgentsReference(content: string): boolean {
  return content.split(/\r?\n/).some(line => line.trim() === '@AGENTS.md')
}

function removeAgentsReference(content: string): string {
  const lines = content.split(/\r?\n/)
  const nextLines = lines.filter(line => line.trim() !== '@AGENTS.md')

  if (content.trimStart().startsWith('@AGENTS.md')) {
    while (nextLines[0]?.trim() === '') {
      nextLines.shift()
    }
  }

  return nextLines.join('\n')
}

function resolveSymlinkTarget(linkPath: string, target: string): string {
  if (isAbsolute(target)) {
    return resolve(target)
  }

  return resolve(dirname(linkPath), target)
}

async function isDanglingSymlink(linkPath: string): Promise<boolean> {
  try {
    await readStat(linkPath)
    return false
  } catch (error) {
    if (isMissingPath(error)) {
      return true
    }

    throw error
  }
}

async function pointsToAgentsFile(linkPath: string): Promise<boolean> {
  const actualTarget = resolveSymlinkTarget(linkPath, await readlink(linkPath))
  const expectedTarget = resolveSymlinkTarget(linkPath, claudeFileLinkTarget)
  return actualTarget === expectedTarget
}

function isMissingPath(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }

  return error.code === 'ENOENT' || error.code === 'ENOTDIR'
}
