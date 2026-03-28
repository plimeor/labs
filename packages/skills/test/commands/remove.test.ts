import { describe, expect, test } from 'bun:test'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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

    await withCwd(cwd, () => removeCommand({ args: { target: 'demo' }, options: {} }))

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
})
