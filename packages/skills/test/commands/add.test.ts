import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { $ } from 'bun'

import { readJson, tempDir, writeGlobalLock } from '../helpers/fs'
import { withHome } from '../helpers/process'

type PromptOption = {
  disabled?: boolean
  hint?: string
  label?: string
  value: string
}

type MultiselectOptions = {
  options: PromptOption[]
}

type PromptTask = {
  task: () => Promise<string> | string
}

const multiselectCalls: MultiselectOptions[] = []
let multiselectResult: string[] | symbol = []

mock.module('@clack/prompts', () => ({
  cancel: () => undefined,
  isCancel: (value: unknown) => typeof value === 'symbol',
  log: {
    info: () => undefined,
    step: () => undefined,
    success: () => undefined
  },
  multiselect: async (options: MultiselectOptions) => {
    multiselectCalls.push(options)
    return multiselectResult
  },
  tasks: async (items: PromptTask[]) => {
    for (const item of items) {
      await item.task()
    }
  }
}))

const { addCommand } = await import('../../src/commands/add')

afterEach(() => {
  multiselectCalls.length = 0
  multiselectResult = []
})

describe('add command', () => {
  test('installs a git skill and writes manifest plus lock state', async () => {
    const home = await tempDir('skills-add-home-')
    const { commit, source } = await createGitSource('skills-add-source-', ['demo'])

    await withHome(home, () =>
      addCommand({
        args: { skills: [], source },
        options: { global: true, skill: ['demo'] }
      })
    )

    expect(await readFile(join(home, '.agents', 'skills', 'demo', 'SKILL.md'), 'utf-8')).toContain('name: demo')
    expect(await readJson(join(home, '.agents', 'skills.json'))).toEqual({
      schemaVersion: 1,
      scope: 'global',
      sources: [{ source, skills: [{ name: 'demo', path: 'skills/demo' }] }]
    })
    expect(await readJson(join(home, '.agents', 'skills.lock.json'))).toEqual({
      schemaVersion: 1,
      scope: 'global',
      skills: {
        demo: {
          commit,
          installedAt: expect.any(String),
          installPath: join(home, '.agents', 'skills', 'demo'),
          method: 'copy',
          path: 'skills/demo',
          source
        }
      }
    })
  })

  test('installs all skills from the source skills directory', async () => {
    const home = await tempDir('skills-add-all-home-')
    const { source } = await createGitSource('skills-add-all-source-', ['b', 'a'])

    await withHome(home, () =>
      addCommand({
        args: { skills: [], source },
        options: { all: true, global: true }
      })
    )

    expect(await readFile(join(home, '.agents', 'skills', 'a', 'SKILL.md'), 'utf-8')).toContain('name: a')
    expect(await readFile(join(home, '.agents', 'skills', 'b', 'SKILL.md'), 'utf-8')).toContain('name: b')
    expect(await readJson(join(home, '.agents', 'skills.json'))).toEqual({
      schemaVersion: 1,
      scope: 'global',
      sources: [{ source, skills: 'all' }]
    })
  })

  test('CLI binds source plus skill rest arguments', async () => {
    const home = await tempDir('skills-add-cli-home-')
    const { source } = await createGitSource('skills-add-cli-source-', ['b', 'a'])

    await $`bun ${cliPath()} add ${source} b a -g`.env({ ...process.env, HOME: home }).quiet()

    expect(await readJson(join(home, '.agents', 'skills.json'))).toEqual({
      schemaVersion: 1,
      scope: 'global',
      sources: [
        {
          source,
          skills: [
            { name: 'a', path: 'skills/a' },
            { name: 'b', path: 'skills/b' }
          ]
        }
      ]
    })
    expect(await readFile(join(home, '.agents', 'skills', 'a', 'SKILL.md'), 'utf-8')).toContain('name: a')
    expect(await readFile(join(home, '.agents', 'skills', 'b', 'SKILL.md'), 'utf-8')).toContain('name: b')
  })

  test('prompts for uninstalled skills and installs selected skills', async () => {
    const home = await tempDir('skills-add-prompt-home-')
    const { commit, source } = await createGitSource('skills-add-prompt-source-', ['b', 'a', 'c'])
    await writeGlobalLock(home, {
      schemaVersion: 1,
      scope: 'global',
      skills: {
        b: {
          commit,
          installedAt: '2026-05-01T00:00:00.000Z',
          installPath: join(home, '.agents', 'skills', 'b'),
          method: 'copy',
          path: 'skills/b',
          source
        }
      }
    })
    multiselectResult = ['a']

    await withHome(home, () =>
      addCommand({
        args: { skills: [], source },
        options: { global: true }
      })
    )

    expect(multiselectCalls).toHaveLength(1)
    expect(multiselectCalls[0].options.map(option => option.label)).toEqual(['a', 'c', 'b (installed)'])
    expect(multiselectCalls[0].options.map(option => option.disabled ?? false)).toEqual([false, false, true])
    expect(await readFile(join(home, '.agents', 'skills', 'a', 'SKILL.md'), 'utf-8')).toContain('name: a')
    expect(await fileExists(join(home, '.agents', 'skills', 'c', 'SKILL.md'))).toBe(false)
    expect(await readJson(join(home, '.agents', 'skills.json'))).toEqual({
      schemaVersion: 1,
      scope: 'global',
      sources: [{ source, skills: [{ name: 'a', path: 'skills/a' }] }]
    })
  })

  test('skips prompting when all source skills are already installed', async () => {
    const home = await tempDir('skills-add-all-installed-home-')
    const { commit, source } = await createGitSource('skills-add-all-installed-source-', ['a', 'b'])
    await writeGlobalLock(home, {
      schemaVersion: 1,
      scope: 'global',
      skills: {
        a: {
          commit,
          installedAt: '2026-05-01T00:00:00.000Z',
          installPath: join(home, '.agents', 'skills', 'a'),
          method: 'copy',
          path: 'skills/a',
          source
        },
        b: {
          commit,
          installedAt: '2026-05-01T00:00:00.000Z',
          installPath: join(home, '.agents', 'skills', 'b'),
          method: 'copy',
          path: 'skills/b',
          source
        }
      }
    })
    multiselectResult = ['a']

    await withHome(home, () =>
      addCommand({
        args: { skills: [], source },
        options: { global: true }
      })
    )

    expect(multiselectCalls).toHaveLength(0)
    expect(await fileExists(join(home, '.agents', 'skills.json'))).toBe(false)
    expect(await readJson(join(home, '.agents', 'skills.lock.json'))).toEqual({
      schemaVersion: 1,
      scope: 'global',
      skills: {
        a: {
          commit,
          installedAt: '2026-05-01T00:00:00.000Z',
          installPath: join(home, '.agents', 'skills', 'a'),
          method: 'copy',
          path: 'skills/a',
          source
        },
        b: {
          commit,
          installedAt: '2026-05-01T00:00:00.000Z',
          installPath: join(home, '.agents', 'skills', 'b'),
          method: 'copy',
          path: 'skills/b',
          source
        }
      }
    })
  })
})

async function writeSkill(source: string, name: string): Promise<void> {
  await mkdir(join(source, 'skills', name), { recursive: true })
  await writeFile(join(source, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n`)
}

async function createGitSource(prefix: string, skillNames: string[]): Promise<{ commit: string; source: string }> {
  const repo = await tempDir(prefix)
  await $`git init -b main`.cwd(repo).quiet()
  for (const skillName of skillNames) {
    await writeSkill(repo, skillName)
  }
  await $`git add skills`.cwd(repo).quiet()
  await $`git -c user.email=skills@example.com -c user.name=Skills commit -m init`.cwd(repo).quiet()
  const commit = await $`git rev-parse HEAD`
    .cwd(repo)
    .quiet()
    .text()
    .then(text => text.trim())
  return { commit, source: `file://${repo}` }
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

function cliPath(): string {
  return Bun.resolveSync('../../src/cli', import.meta.dir)
}
