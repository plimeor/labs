import { describe, expect, test } from 'bun:test'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { migrateCommand } from '../../src/commands/migrate.js'
import { readJson, tempDir } from '../helpers/fs.js'
import { withCwd, withHome } from '../helpers/process.js'

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
})
