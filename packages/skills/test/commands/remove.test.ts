import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'zx'

import { removeCommand } from '../../src/commands/remove.js'
import { readJson, tempDir, writeProjectLock, writeProjectManifest } from '../helpers/fs.js'
import { withCwd } from '../helpers/process.js'

describe('remove command', () => {
  test('removes installed directory and deletes manifest plus lock entries', async () => {
    const cwd = await tempDir('skills-remove-')
    await writeProjectManifest(cwd, {
      schemaVersion: 1,
      scope: 'project',
      skills: [{ name: 'demo', path: 'demo', source: 'repo' }]
    })
    await writeProjectLock(cwd, {
      schemaVersion: 1,
      scope: 'project',
      skills: {
        demo: {
          commit: 'abc',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: join(cwd, '.agents', 'skills', 'demo'),
          method: 'copy',
          path: 'demo',
          source: 'repo'
        }
      }
    })
    await mkdir(join(cwd, '.agents', 'skills', 'demo'), { recursive: true })
    await writeFile(join(cwd, '.agents', 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Demo\n---\n')

    await withCwd(cwd, () => removeCommand({ args: { skills: ['demo'] }, options: {} }))

    expect(await readJson(join(cwd, '.agents', 'skills.json'))).toEqual({
      schemaVersion: 1,
      scope: 'project',
      sources: []
    })
    expect(await readJson(join(cwd, '.agents', 'skills.lock.json'))).toEqual({
      schemaVersion: 1,
      scope: 'project',
      skills: {}
    })
    await expect(stat(join(cwd, '.agents', 'skills', 'demo'))).rejects.toThrow()
  })

  test('removes multiple installed skills from one CLI invocation', async () => {
    const cwd = await tempDir('skills-remove-many-')
    await writeProjectManifest(cwd, {
      schemaVersion: 1,
      scope: 'project',
      skills: [
        { name: 'a', path: 'skills/a', source: 'repo' },
        { name: 'b', path: 'skills/b', source: 'repo' },
        { name: 'c', path: 'skills/c', source: 'repo' }
      ]
    })
    await writeProjectLock(cwd, {
      schemaVersion: 1,
      scope: 'project',
      skills: {
        a: lockedSkill(cwd, 'a'),
        b: lockedSkill(cwd, 'b'),
        c: lockedSkill(cwd, 'c')
      }
    })
    await writeInstalledSkill(cwd, 'a')
    await writeInstalledSkill(cwd, 'b')
    await writeInstalledSkill(cwd, 'c')

    await $({ cwd, quiet: true })`bun ${cliPath()} remove a c`

    expect(await readJson(join(cwd, '.agents', 'skills.json'))).toEqual({
      schemaVersion: 1,
      scope: 'project',
      sources: [{ skills: [{ name: 'b', path: 'skills/b' }], source: 'repo' }]
    })
    expect(await readJson(join(cwd, '.agents', 'skills.lock.json'))).toEqual({
      schemaVersion: 1,
      scope: 'project',
      skills: {
        b: lockedSkill(cwd, 'b')
      }
    })
    await expect(stat(join(cwd, '.agents', 'skills', 'a'))).rejects.toThrow()
    await expect(stat(join(cwd, '.agents', 'skills', 'c'))).rejects.toThrow()
    expect(await readFile(join(cwd, '.agents', 'skills', 'b', 'SKILL.md'), 'utf-8')).toContain('name: b')
  })
})

function cliPath(): string {
  return fileURLToPath(new URL('../../src/cli.ts', import.meta.url))
}

function lockedSkill(cwd: string, name: string) {
  return {
    commit: 'abc',
    installedAt: '2026-04-25T00:00:00.000Z',
    installPath: join(cwd, '.agents', 'skills', name),
    method: 'copy' as const,
    path: `skills/${name}`,
    source: 'repo'
  }
}

async function writeInstalledSkill(cwd: string, name: string): Promise<void> {
  const skillDir = join(cwd, '.agents', 'skills', name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n`)
}
