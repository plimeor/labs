import { afterEach, describe, expect, mock, test } from 'bun:test'
import { lstat, mkdir, readlink, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { $ } from 'bun'

import { SyncPlan } from '../../src/sync-plan'
import { tempDir, writeGlobalManifest, writeProjectLock, writeProjectManifest } from '../helpers/fs'
import { captureStdout, withCwd, withHome } from '../helpers/process'

type PromptTask = {
  title: string
  task: () => Promise<string> | string
}

type ConfirmOptions = {
  message: string
}

const confirmCalls: ConfirmOptions[] = []
let confirmResult: boolean | symbol = false
const infoCalls: string[] = []
const taskResults: string[] = []
const taskTitles: string[] = []

mock.module('@clack/prompts', () => ({
  cancel: () => undefined,
  confirm: async (options: ConfirmOptions) => {
    confirmCalls.push({ message: options.message })
    return confirmResult
  },
  isCancel: (value: unknown) => typeof value === 'symbol',
  isTTY: () => true,
  log: {
    info: (message: string) => {
      infoCalls.push(message)
    },
    message: (message: string) => {
      process.stdout.write(`${message}\n`)
    },
    step: () => undefined,
    success: () => undefined
  },
  multiselect: async () => [],
  tasks: async (items: PromptTask[]) => {
    for (const item of items) {
      taskTitles.push(item.title)
      taskResults.push(await item.task())
    }
  }
}))

const { syncCommand } = await import('../../src/commands/sync')

afterEach(() => {
  confirmCalls.length = 0
  confirmResult = false
  infoCalls.length = 0
  taskResults.length = 0
  taskTitles.length = 0
})

describe('sync planning', () => {
  test('refreshes refs by default and uses locked commits only in locked mode', () => {
    const manifest = {
      schemaVersion: 1 as const,
      scope: 'global' as const,
      skills: [
        { name: 'a', path: 'skills/a', ref: 'main', source: 'repo' },
        { commit: 'pinned', name: 'b', path: 'skills/b', source: 'repo' }
      ]
    }
    const lock = {
      schemaVersion: 1 as const,
      scope: 'global' as const,
      skills: {
        a: {
          commit: 'locked-a',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: '/tmp/a',
          method: 'copy' as const,
          path: 'skills/a',
          ref: 'main',
          source: 'repo'
        },
        b: {
          commit: 'pinned',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: '/tmp/b',
          method: 'copy' as const,
          path: 'skills/b',
          source: 'repo'
        },
        stale: {
          commit: 'stale',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: '/tmp/stale',
          method: 'copy' as const,
          source: 'repo'
        }
      }
    }

    expect(SyncPlan.plan(manifest, lock, { locked: false })).toMatchObject({
      pruneNames: ['stale'],
      installRequests: [
        { ref: 'main', source: 'repo' },
        { commit: 'pinned', source: 'repo' }
      ]
    })
    expect(SyncPlan.plan(manifest, lock, { locked: true }).installRequests).toEqual([
      { commit: 'locked-a', source: 'repo' },
      { commit: 'pinned', source: 'repo' }
    ])
  })

  test('locked mode fails when lock entries are missing or mismatched', () => {
    const manifest = {
      schemaVersion: 1 as const,
      scope: 'global' as const,
      skills: [{ name: 'a', path: 'skills/a', ref: 'main', source: 'repo' }]
    }

    expect(() =>
      SyncPlan.plan({ ...manifest }, { schemaVersion: 1, scope: 'global', skills: {} }, { locked: true })
    ).toThrow('Missing locked skill')
    expect(() =>
      SyncPlan.plan(
        { ...manifest },
        {
          schemaVersion: 1,
          scope: 'global',
          skills: {
            a: {
              commit: 'abc',
              installedAt: '2026-04-25T00:00:00.000Z',
              installPath: '/tmp/a',
              method: 'copy',
              path: 'other',
              ref: 'main',
              source: 'repo'
            }
          }
        },
        { locked: true }
      )
    ).toThrow('does not match')
  })
})

describe('sync command', () => {
  test('dry-run prints one checkout for multiple skills sharing source and ref', async () => {
    const { home, source } = await writeManifestFixture()

    const output = await captureStdout(async () =>
      withHome(home, async () => {
        await syncCommand({ options: { dryRun: true, global: true } })
      })
    )

    expect(output).toBe(`checkout ${source} at ref main
install a to ~/.agents/skills
install b to ~/.agents/skills
`)
  })

  test('dry-run prints already in sync when locked commit and content hash are current', async () => {
    const { cwd } = await writeCurrentProjectFixture()

    const output = await captureStdout(async () =>
      withCwd(cwd, async () => {
        await syncCommand({ options: { dryRun: true } })
      })
    )

    expect(output).toBe('Skills are already in sync\n')
  })

  test('sync prunes stale lock entries and writes resolved commits', async () => {
    const { commit, cwd } = await writeProjectManifestFixture()
    await writeInstalledSkill(cwd, 'old')

    await withCwd(cwd, () => syncCommand({ options: {} }))

    const lock = await readProjectLock(cwd)
    expect(lock.skills.a.commit).toBe(commit)
    expect(lock.skills.b.commit).toBe(commit)
    expect(lock.skills.old).toBeUndefined()
    await expect(fileExists(join(cwd, '.agents', 'skills', 'old', 'SKILL.md'))).resolves.toBe(false)
    await expect(fileExists(join(cwd, '.agents', 'skills', 'a', 'SKILL.md'))).resolves.toBe(true)
    await expect(fileExists(join(cwd, '.agents', 'skills', 'b', 'SKILL.md'))).resolves.toBe(true)
  })

  test('skips repository install when locked commit and installed skills are current', async () => {
    const { cwd } = await writeCurrentProjectFixture()
    infoCalls.length = 0

    await withCwd(cwd, () => syncCommand({ options: {} }))

    const lock = await readProjectLock(cwd)
    expect(lock.skills.a.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(lock.skills.b.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(lock.skills.a.installedAt).toBe('2026-05-01T00:00:00.000Z')
    expect(lock.skills.b.installedAt).toBe('2026-05-01T00:00:00.000Z')
    expect(infoCalls).toContain(`Skipped 2 skills already in sync:
- a
- b`)
  })

  test('skips pinned repository install without cloning source when content hashes are current', async () => {
    const { cwd, sourceDir } = await writeCurrentPinnedProjectFixture()
    await rm(sourceDir, { force: true, recursive: true })

    await withCwd(cwd, () => syncCommand({ options: {} }))

    const lock = await readProjectLock(cwd)
    expect(lock.skills.a.installedAt).toBe('2026-05-01T00:00:00.000Z')
    expect(lock.skills.b.installedAt).toBe('2026-05-01T00:00:00.000Z')
  })

  test('expands pinned all-skills source from lock without cloning source when current', async () => {
    const { cwd, sourceDir } = await writeCurrentPinnedAllProjectFixture()
    await rm(sourceDir, { force: true, recursive: true })

    const output = await captureStdout(async () =>
      withCwd(cwd, async () => {
        await syncCommand({ options: { dryRun: true } })
      })
    )

    expect(output).toBe('Skills are already in sync\n')
  })

  test('splits unchanged updated and new skills when all-skills source commit changes', async () => {
    const { cwd, sourceDir } = await writeCurrentAllProjectFixture()
    const nextCommit = await commitSkillChanges(sourceDir, async () => {
      await writeSkill(sourceDir, 'b', 'b updated')
      await writeSkill(sourceDir, 'c')
    })
    infoCalls.length = 0
    taskResults.length = 0
    taskTitles.length = 0

    await withCwd(cwd, () => syncCommand({ options: {} }))

    const lock = await readProjectLock(cwd)
    expect(infoCalls).toContain(`Skipped 1 skill already in sync:
- a`)
    expect(taskTitles).toContain('Update b')
    expect(taskTitles).toContain('Install c')
    expect(taskResults.some(result => result.startsWith('Updated ') && result.endsWith('/.agents/skills/b'))).toBe(true)
    expect(taskResults.some(result => result.startsWith('Installed ') && result.endsWith('/.agents/skills/c'))).toBe(
      true
    )
    expect(lock.skills.a.commit).toBe(nextCommit)
    expect(lock.skills.a.installedAt).toBe('2026-05-01T00:00:00.000Z')
    expect(lock.skills.b.commit).toBe(nextCommit)
    expect(lock.skills.b.installedAt).not.toBe('2026-05-01T00:00:00.000Z')
    expect(lock.skills.c.commit).toBe(nextCommit)
    expect(await readInstalledSkill(cwd, 'b')).toContain('description: b updated')
    await expect(fileExists(join(cwd, '.agents', 'skills', 'c', 'SKILL.md'))).resolves.toBe(true)
  })

  test('reinstalls repository when a locked skill content hash changes', async () => {
    const { cwd } = await writeCurrentProjectFixture()
    await writeFile(join(cwd, '.agents', 'skills', 'b', 'SKILL.md'), '---\nname: b\ndescription: Local edit\n---\n')

    await withCwd(cwd, () => syncCommand({ options: {} }))

    const lock = await readProjectLock(cwd)
    expect(lock.skills.a.installedAt).toBe('2026-05-01T00:00:00.000Z')
    expect(lock.skills.b.installedAt).not.toBe('2026-05-01T00:00:00.000Z')
    expect(await readInstalledSkill(cwd, 'b')).toContain('description: b')
  })

  test('prompts before linking detected agent targets after writing state', async () => {
    const home = await tempDir('skills-sync-agent-target-home-')
    await mkdir(join(home, '.claude'), { recursive: true })
    await writeGlobalManifest(home, {
      schemaVersion: 1,
      scope: 'global',
      skills: []
    })
    confirmResult = true

    await withIsolatedAgentEnv(home, () => syncCommand({ options: { global: true } }))

    const target = join(home, '.claude', 'skills')
    expect(confirmCalls).toEqual([
      {
        message: 'Create links for 1 detected agent target to ~/.agents/skills?'
      }
    ])
    expect((await lstat(target)).isSymbolicLink()).toBe(true)
    expect(await readlink(target)).toBe(join(home, '.agents', 'skills'))
  })
})

async function writeManifestFixture(): Promise<{ home: string; source: string }> {
  const home = await tempDir('skills-sync-dry-run-')
  const { source } = await createGitRepo()
  await writeGlobalManifest(home, {
    schemaVersion: 1,
    scope: 'global',
    skills: [
      { name: 'b', path: 'skills/b', ref: 'main', source },
      { name: 'a', path: 'skills/a', ref: 'main', source }
    ]
  })
  return { home, source }
}

async function writeProjectManifestFixture(): Promise<{ commit: string; cwd: string }> {
  const cwd = await tempDir('skills-sync-run-')
  const { commit, source } = await createGitRepo()
  await writeProjectManifest(cwd, {
    schemaVersion: 1,
    scope: 'project',
    skills: [
      { name: 'b', path: 'skills/b', ref: 'main', source },
      { name: 'a', path: 'skills/a', ref: 'main', source }
    ]
  })
  await writeProjectLock(cwd, {
    schemaVersion: 1,
    scope: 'project',
    skills: {
      old: {
        commit: 'old',
        installedAt: '2026-04-24T00:00:00.000Z',
        installPath: `${cwd}/.agents/skills/old`,
        method: 'copy',
        source: 'repo'
      }
    }
  })
  return { commit, cwd }
}

async function writeCurrentProjectFixture(): Promise<{ commit: string; cwd: string; source: string }> {
  const cwd = await tempDir('skills-sync-current-')
  const { commit, source } = await createGitRepo()
  await writeProjectManifest(cwd, {
    schemaVersion: 1,
    scope: 'project',
    skills: [
      { name: 'b', path: 'skills/b', ref: 'main', source },
      { name: 'a', path: 'skills/a', ref: 'main', source }
    ]
  })
  await withCwd(cwd, () => syncCommand({ options: {} }))
  await freezeProjectLockInstalledAt(cwd)
  return { commit, cwd, source }
}

async function writeCurrentPinnedProjectFixture(): Promise<{
  commit: string
  cwd: string
  source: string
  sourceDir: string
}> {
  const cwd = await tempDir('skills-sync-current-pinned-')
  const { commit, source, sourceDir } = await createGitRepo()
  await writeProjectManifest(cwd, {
    schemaVersion: 1,
    scope: 'project',
    skills: [
      { commit, name: 'b', path: 'skills/b', source },
      { commit, name: 'a', path: 'skills/a', source }
    ]
  })
  await withCwd(cwd, () => syncCommand({ options: {} }))
  await freezeProjectLockInstalledAt(cwd)
  return { commit, cwd, source, sourceDir }
}

async function writeCurrentPinnedAllProjectFixture(): Promise<{
  commit: string
  cwd: string
  source: string
  sourceDir: string
}> {
  const cwd = await tempDir('skills-sync-current-all-pinned-')
  const { commit, source, sourceDir } = await createGitRepo()
  await writeProjectManifest(cwd, {
    schemaVersion: 1,
    scope: 'project',
    skills: [],
    sources: [{ commit, skills: 'all', source }]
  })
  await withCwd(cwd, () => syncCommand({ options: {} }))
  await freezeProjectLockInstalledAt(cwd)
  return { commit, cwd, source, sourceDir }
}

async function writeCurrentAllProjectFixture(): Promise<{
  commit: string
  cwd: string
  source: string
  sourceDir: string
}> {
  const cwd = await tempDir('skills-sync-current-all-')
  const { commit, source, sourceDir } = await createGitRepo()
  await writeProjectManifest(cwd, {
    schemaVersion: 1,
    scope: 'project',
    skills: [],
    sources: [{ ref: 'main', skills: 'all', source }]
  })
  await withCwd(cwd, () => syncCommand({ options: {} }))
  await freezeProjectLockInstalledAt(cwd)
  return { commit, cwd, source, sourceDir }
}

async function freezeProjectLockInstalledAt(cwd: string): Promise<void> {
  const lock = await readProjectLock(cwd)
  await writeProjectLock(cwd, {
    ...lock,
    skills: Object.fromEntries(
      Object.entries(lock.skills).map(([name, skill]) => [name, { ...skill, installedAt: '2026-05-01T00:00:00.000Z' }])
    )
  })
}

async function createGitRepo(): Promise<{ commit: string; source: string; sourceDir: string }> {
  const sourceDir = await tempDir('skills-sync-source-')
  await $`git init -b main`.cwd(sourceDir).quiet()
  await writeSkill(sourceDir, 'a')
  await writeSkill(sourceDir, 'b')
  await $`git add skills`.cwd(sourceDir).quiet()
  await $`git -c user.email=skills@example.com -c user.name=Skills commit -m init`.cwd(sourceDir).quiet()
  const commit = await $`git rev-parse HEAD`
    .cwd(sourceDir)
    .quiet()
    .text()
    .then(text => text.trim())
  return { commit, source: `file://${sourceDir}`, sourceDir }
}

async function readProjectLock(cwd: string): Promise<{
  schemaVersion: 1
  scope: 'project'
  skills: Record<
    string,
    {
      commit: string
      contentHash?: string
      installedAt: string
      installPath: string
      method: 'copy'
      path?: string
      ref?: string
      source: string
    }
  >
}> {
  return JSON.parse(await Bun.file(join(cwd, '.agents', 'skills.lock.json')).text())
}

async function commitSkillChanges(sourceDir: string, callback: () => Promise<void>): Promise<string> {
  await callback()
  await $`git add skills`.cwd(sourceDir).quiet()
  await $`git -c user.email=skills@example.com -c user.name=Skills commit -m update`.cwd(sourceDir).quiet()
  return await $`git rev-parse HEAD`
    .cwd(sourceDir)
    .quiet()
    .text()
    .then(text => text.trim())
}

async function writeSkill(source: string, name: string, description = name): Promise<void> {
  const skillDir = join(source, 'skills', name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`)
}

async function writeInstalledSkill(cwd: string, name: string): Promise<void> {
  const skillDir = join(cwd, '.agents', 'skills', name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n`)
}

async function readInstalledSkill(cwd: string, name: string): Promise<string> {
  return await Bun.file(join(cwd, '.agents', 'skills', name, 'SKILL.md')).text()
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function withIsolatedAgentEnv<T>(home: string, callback: () => Promise<T>): Promise<T> {
  const previous = {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
    VIBE_HOME: process.env.VIBE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME
  }
  process.env.XDG_CONFIG_HOME = join(home, '.config')
  delete process.env.CLAUDE_CONFIG_DIR
  delete process.env.CODEX_HOME
  delete process.env.VIBE_HOME
  try {
    return await withHome(home, callback)
  } finally {
    restoreEnv('CLAUDE_CONFIG_DIR', previous.CLAUDE_CONFIG_DIR)
    restoreEnv('CODEX_HOME', previous.CODEX_HOME)
    restoreEnv('VIBE_HOME', previous.VIBE_HOME)
    restoreEnv('XDG_CONFIG_HOME', previous.XDG_CONFIG_HOME)
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}
