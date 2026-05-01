import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { readJson, tempDir, writeGlobalLock } from '../helpers/fs.js'
import { withHome } from '../helpers/process.js'

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

const { addCommand } = await import('../../src/commands/add.js')

afterEach(() => {
  multiselectCalls.length = 0
  multiselectResult = []
})

describe('add command', () => {
  test('installs a local skill and writes manifest plus lock state', async () => {
    const home = await tempDir('skills-add-home-')
    const source = await tempDir('skills-add-source-')
    await mkdir(join(source, 'skills', 'demo'), { recursive: true })
    await writeFile(join(source, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Demo\n---\n')

    await withHome(home, () =>
      addCommand({
        args: { source },
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
          commit: 'local',
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
    const source = await tempDir('skills-add-all-source-')
    await writeSkill(source, 'b')
    await writeSkill(source, 'a')

    await withHome(home, () =>
      addCommand({
        args: { source },
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

  test('prompts for uninstalled skills and installs selected skills', async () => {
    const home = await tempDir('skills-add-prompt-home-')
    const source = await tempDir('skills-add-prompt-source-')
    await writeSkill(source, 'b')
    await writeSkill(source, 'a')
    await writeSkill(source, 'c')
    await writeGlobalLock(home, {
      schemaVersion: 1,
      scope: 'global',
      skills: {
        b: {
          commit: 'local',
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
        args: { source },
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
    const source = await tempDir('skills-add-all-installed-source-')
    await writeSkill(source, 'a')
    await writeSkill(source, 'b')
    await writeGlobalLock(home, {
      schemaVersion: 1,
      scope: 'global',
      skills: {
        a: {
          commit: 'local',
          installedAt: '2026-05-01T00:00:00.000Z',
          installPath: join(home, '.agents', 'skills', 'a'),
          method: 'copy',
          path: 'skills/a',
          source
        },
        b: {
          commit: 'local',
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
        args: { source },
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
          commit: 'local',
          installedAt: '2026-05-01T00:00:00.000Z',
          installPath: join(home, '.agents', 'skills', 'a'),
          method: 'copy',
          path: 'skills/a',
          source
        },
        b: {
          commit: 'local',
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
