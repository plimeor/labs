import { afterEach, describe, expect, mock, test } from 'bun:test'
import { lstat, mkdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { readJson, tempDir } from '../helpers/fs'
import { withCwd, withHome } from '../helpers/process'

type PromptTask = {
  task: () => Promise<string> | string
}

type ConfirmOptions = {
  message: string
}

const confirmCalls: ConfirmOptions[] = []
let confirmResult: boolean | symbol = false

mock.module('@clack/prompts', () => ({
  cancel: () => undefined,
  confirm: async (options: ConfirmOptions) => {
    confirmCalls.push({ message: options.message })
    return confirmResult
  },
  isCancel: (value: unknown) => typeof value === 'symbol',
  isTTY: () => true,
  log: {
    info: () => undefined,
    message: () => undefined,
    step: () => undefined,
    success: () => undefined
  },
  multiselect: async () => [],
  tasks: async (items: PromptTask[]) => {
    for (const item of items) {
      await item.task()
    }
  }
}))

const { migrateCommand } = await import('../../src/commands/migrate')

afterEach(() => {
  confirmCalls.length = 0
  confirmResult = false
})

describe('migrate command', () => {
  test('writes output manifest without mutating the input lock file', async () => {
    const cwd = await tempDir('skills-migrate-')
    const input = join(cwd, 'custom-lock.json')
    const output = join(cwd, 'skills.json')
    const outputLock = join(cwd, 'skills.lock.json')
    const lock = JSON.stringify(
      {
        version: 3,
        skills: {
          a: {
            commit: 'abc123',
            installedAt: '2026-04-25T00:00:00.000Z',
            installedPath: '/tmp/a',
            source: 'repo'
          }
        }
      },
      null,
      2
    )
    await writeFile(input, lock)

    await withCwd(cwd, () =>
      migrateCommand({ args: { input: 'custom-lock.json' }, options: { output: 'skills.json' } })
    )

    expect(await readFile(input, 'utf-8')).toBe(lock)
    expect(await readFile(output, 'utf-8')).not.toContain('version')
    expect(((await readJson(output)) as { sources: unknown[] }).sources).toEqual([
      { skills: [{ name: 'a', path: 'skills/a' }], source: 'repo' }
    ])
    expect(await readJson(outputLock)).toEqual({
      schemaVersion: 1,
      scope: 'project',
      skills: {
        a: {
          commit: 'abc123',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: '/tmp/a',
          method: 'copy',
          path: 'skills/a',
          source: 'repo'
        }
      }
    })
  })

  test('defaults to ./skills-lock.json when no input is provided', async () => {
    const cwd = await tempDir('skills-migrate-default-')
    const realCwd = await realpath(cwd)
    const output = join(cwd, '.agents', 'skills.json')
    await writeFile(join(cwd, 'skills-lock.json'), JSON.stringify({ skills: { a: { source: 'repo' } } }))

    await withCwd(cwd, () => migrateCommand({ args: {}, options: {} }))

    expect(((await readJson(output)) as { sources: unknown[] }).sources).toEqual([
      { skills: [{ name: 'a', path: 'skills/a' }], source: 'repo' }
    ])
    expect(await readJson(join(cwd, '.agents', 'skills.lock.json'))).toEqual({
      schemaVersion: 1,
      scope: 'project',
      skills: {
        a: {
          commit: 'HEAD',
          installedAt: expect.any(String),
          installPath: join(realCwd, '.agents', 'skills', 'a'),
          method: 'copy',
          path: 'skills/a',
          source: 'repo'
        }
      }
    })
  })

  test('defaults to ~/.agents/.skill-lock.json in global mode', async () => {
    const cwd = await tempDir('skills-migrate-global-cwd-')
    const home = await tempDir('skills-migrate-global-home-')
    const output = join(cwd, 'skills.json')
    await mkdir(join(home, '.agents'), { recursive: true })
    await writeFile(join(home, '.agents', '.skill-lock.json'), JSON.stringify({ skills: { a: { source: 'repo' } } }))

    await withHome(home, () =>
      withCwd(cwd, () => migrateCommand({ args: {}, options: { global: true, output: 'skills.json' } }))
    )

    expect(((await readJson(output)) as { sources: unknown[] }).sources).toEqual([
      { skills: [{ name: 'a', path: 'skills/a' }], source: 'repo' }
    ])
    expect(await readJson(join(cwd, 'skills.lock.json'))).toEqual({
      schemaVersion: 1,
      scope: 'global',
      skills: {
        a: {
          commit: 'HEAD',
          installedAt: expect.any(String),
          installPath: join(home, '.agents', 'skills', 'a'),
          method: 'copy',
          path: 'skills/a',
          source: 'repo'
        }
      }
    })
  })

  test('prompts before linking detected agent targets after migration', async () => {
    const cwd = await tempDir('skills-migrate-agent-target-cwd-')
    const home = await tempDir('skills-migrate-agent-target-home-')
    await mkdir(join(home, '.agents'), { recursive: true })
    await mkdir(join(home, '.claude'), { recursive: true })
    await writeFile(join(home, '.agents', '.skill-lock.json'), JSON.stringify({ skills: { a: { source: 'repo' } } }))
    confirmResult = true

    await withIsolatedAgentEnv(home, () => withCwd(cwd, () => migrateCommand({ args: {}, options: { global: true } })))

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
