import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { migrateCommand } from '../../src/commands/migrate.js'
import { readJson, tempDir } from '../helpers/fs.js'
import { withCwd, withHome } from '../helpers/process.js'

describe('migrate command', () => {
  test('writes output manifest without mutating the input lock file', async () => {
    const cwd = await tempDir('skills-migrate-')
    const input = join(cwd, 'custom-lock.json')
    const output = join(cwd, 'skills.json')
    const lock = JSON.stringify({ skills: { a: { source: 'repo' } }, version: 3 }, null, 2)
    await writeFile(input, lock)

    await withCwd(cwd, () =>
      migrateCommand({ args: { input: 'custom-lock.json' }, options: { output: 'skills.json' } })
    )

    expect(await readFile(input, 'utf-8')).toBe(lock)
    expect(await readFile(output, 'utf-8')).not.toContain('version')
    expect(((await readJson(output)) as { sources: unknown[] }).sources).toEqual([
      { skills: [{ name: 'a', path: 'skills/a' }], source: 'repo' }
    ])
  })

  test('defaults to ./skills-lock.json when no input is provided', async () => {
    const cwd = await tempDir('skills-migrate-default-')
    const output = join(cwd, 'skills.json')
    await writeFile(join(cwd, 'skills-lock.json'), JSON.stringify({ skills: { a: { source: 'repo' } } }))

    await withCwd(cwd, () => migrateCommand({ args: {}, options: { output: 'skills.json' } }))

    expect(((await readJson(output)) as { sources: unknown[] }).sources).toEqual([
      { skills: [{ name: 'a', path: 'skills/a' }], source: 'repo' }
    ])
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
  })
})
