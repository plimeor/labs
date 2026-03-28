import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { addCommand } from '../../src/commands/add.js'
import { readJson, tempDir } from '../helpers/fs.js'
import { withHome } from '../helpers/process.js'

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
})

async function writeSkill(source: string, name: string): Promise<void> {
  await mkdir(join(source, 'skills', name), { recursive: true })
  await writeFile(join(source, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n`)
}
