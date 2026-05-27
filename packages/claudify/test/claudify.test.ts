import { describe, expect, test } from 'bun:test'
import { lstat, mkdir, mkdtemp, readFile, readlink, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'

import { claudify } from '../src/index'

describe('claudify', () => {
  test('creates CLAUDE.md symlinks and .claude skills links from the git root', async () => {
    const repo = await createGitRepo()
    await mkdir(join(repo, 'docs'), { recursive: true })
    await mkdir(join(repo, 'packages', 'tool', '.agent', 'skills'), { recursive: true })
    await mkdir(join(repo, 'nested'), { recursive: true })
    await writeFile(join(repo, 'docs', 'AGENTS.md'), 'agent rules\n')

    const result = await claudify({ cwd: join(repo, 'nested') })

    await expectSymlink(join(repo, 'docs', 'CLAUDE.md'), 'AGENTS.md')
    await expectSymlink(join(repo, 'packages', 'tool', '.claude', 'skills'), '../.agent/skills')
    expect(result.claudeLinksCreated).toContain(join(repo, 'docs', 'CLAUDE.md'))
    expect(result.skillLinksCreated).toContain(join(repo, 'packages', 'tool', '.claude', 'skills'))
  })

  test('prepends an AGENTS.md reference to an existing CLAUDE.md file', async () => {
    const repo = await createGitRepo()
    await writeFile(join(repo, 'AGENTS.md'), 'agent rules\n')
    await writeFile(join(repo, 'CLAUDE.md'), 'claude rules\n')

    const result = await claudify({ cwd: repo })

    expect(await readFile(join(repo, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\nclaude rules\n')
    expect(result.claudeFilesUpdated).toEqual([join(repo, 'CLAUDE.md')])
  })

  test('keeps a CLAUDE.md symlink to AGENTS.md without rewriting AGENTS.md', async () => {
    const repo = await createGitRepo()
    await writeFile(join(repo, 'AGENTS.md'), 'agent rules\n')
    await symlink('AGENTS.md', join(repo, 'CLAUDE.md'), 'file')

    const result = await claudify({ cwd: repo })

    await expectSymlink(join(repo, 'CLAUDE.md'), 'AGENTS.md')
    expect(await readFile(join(repo, 'AGENTS.md'), 'utf8')).toBe('agent rules\n')
    expect(result.claudeFilesKept).toEqual([join(repo, 'CLAUDE.md')])
  })

  test('deletes dangling CLAUDE.md symlinks when AGENTS.md is missing', async () => {
    const repo = await createGitRepo()
    await symlink('missing.md', join(repo, 'CLAUDE.md'), 'file')

    const result = await claudify({ cwd: repo })

    await expectMissing(join(repo, 'CLAUDE.md'))
    expect(result.claudeFilesDeleted).toEqual([join(repo, 'CLAUDE.md')])
  })

  test('removes stale AGENTS.md references and deletes empty CLAUDE.md files', async () => {
    const repo = await createGitRepo()
    await mkdir(join(repo, 'delete'), { recursive: true })
    await mkdir(join(repo, 'keep'), { recursive: true })
    await writeFile(join(repo, 'delete', 'CLAUDE.md'), '@AGENTS.md\n')
    await writeFile(join(repo, 'keep', 'CLAUDE.md'), '@AGENTS.md\n\ncustom rules\n')

    const result = await claudify({ cwd: repo })

    await expectMissing(join(repo, 'delete', 'CLAUDE.md'))
    expect(await readFile(join(repo, 'keep', 'CLAUDE.md'), 'utf8')).toBe('custom rules\n')
    expect(result.claudeFilesDeleted).toEqual([join(repo, 'delete', 'CLAUDE.md')])
    expect(result.claudeFilesUpdated).toEqual([join(repo, 'keep', 'CLAUDE.md')])
  })
})

async function createGitRepo(): Promise<string> {
  const repo = await realpath(await mkdtemp(join(tmpdir(), 'claudify-test-')))
  await $`git init`.cwd(repo).quiet()
  return repo
}

async function expectSymlink(path: string, target: string): Promise<void> {
  const stats = await lstat(path)
  expect(stats.isSymbolicLink()).toBe(true)
  expect(await readlink(path)).toBe(target)
}

async function expectMissing(path: string): Promise<void> {
  await expect(lstat(path)).rejects.toThrow()
}
