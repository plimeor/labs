import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  createWorktree,
  deleteWorktree,
  getWorktreePath,
  listWorktrees
} from '@/modules/agent/services/workspace.service'

describe('git worktree operations', () => {
  let testDir: string
  const agentName = 'test-agent'

  beforeEach(async () => {
    testDir = join(tmpdir(), `orbit-worktree-${Date.now()}`)
    const workspaceDir = join(testDir, 'agents', agentName, 'workspace')
    await mkdir(workspaceDir, { recursive: true })

    // Initialize a git repo in the workspace dir
    const init = Bun.spawn(['git', 'init'], { cwd: workspaceDir, stdout: 'pipe', stderr: 'pipe' })
    await init.exited

    const commit = Bun.spawn(['git', 'commit', '--allow-empty', '-m', 'init'], {
      cwd: workspaceDir,
      stdout: 'pipe',
      stderr: 'pipe'
    })
    await commit.exited
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('should create a worktree', async () => {
    const path = await createWorktree(agentName, 'task-1', undefined, testDir)
    expect(path).toContain('task-1')
    expect(existsSync(path)).toBe(true)
  })

  it('should return correct worktree path', () => {
    const path = getWorktreePath(agentName, 'task-1', testDir)
    expect(path).toContain(join('workspace', '.worktrees', 'task-1'))
  })

  it('should list worktrees', async () => {
    await createWorktree(agentName, 'task-1', undefined, testDir)
    await createWorktree(agentName, 'task-2', undefined, testDir)
    const trees = await listWorktrees(agentName, testDir)
    expect(trees).toHaveLength(2)
  })

  it('should delete a worktree', async () => {
    const path = await createWorktree(agentName, 'task-1', undefined, testDir)
    await deleteWorktree(agentName, 'task-1', testDir)
    expect(existsSync(path)).toBe(false)
  })

  it('should return empty array when no worktrees exist', async () => {
    const trees = await listWorktrees(agentName, testDir)
    expect(trees).toHaveLength(0)
  })
})
