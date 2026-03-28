import { describe, expect, test } from 'bun:test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Lock } from '../src/lock.js'
import type { Scope } from '../src/scope.js'
import { tempDir } from './helpers/fs.js'

describe('lock parsing', () => {
  test('rejects unsupported schema, scope, missing commit, and unsafe names', async () => {
    await expect(readLockFixture({ schemaVersion: 2, scope: 'global', skills: {} })).rejects.toThrow('schemaVersion')
    await expect(readLockFixture({ schemaVersion: 1, scope: 'user', skills: {} })).rejects.toThrow('scope')
    await expect(
      readLockFixture({
        schemaVersion: 1,
        scope: 'global',
        skills: {
          a: {
            installedAt: '2026-04-25T00:00:00.000Z',
            installPath: '/tmp/a',
            method: 'copy',
            source: 'repo'
          }
        }
      })
    ).rejects.toThrow('commit')
    await expect(
      readLockFixture({
        schemaVersion: 1,
        scope: 'global',
        skills: {
          '../a': {
            commit: 'abc',
            installedAt: '2026-04-25T00:00:00.000Z',
            installPath: '/tmp/a',
            method: 'copy',
            source: 'repo'
          }
        }
      })
    ).rejects.toThrow('path separators')
  })

  test('serializes entries deterministically and supports mutation helpers', async () => {
    let lock: Lock.Document = { schemaVersion: 1, scope: 'global', skills: {} }
    lock = Lock.setSkill(lock, 'b', {
      commit: 'bbb',
      installedAt: '2026-04-25T00:00:00.000Z',
      installPath: '/tmp/b',
      method: 'copy',
      source: 'repo'
    })
    lock = Lock.setSkill(lock, 'a', {
      commit: 'aaa',
      installedAt: '2026-04-25T00:00:00.000Z',
      installPath: '/tmp/a',
      method: 'copy',
      path: 'skills/a',
      ref: 'main',
      source: 'repo'
    })

    expect(Object.keys(lock.skills)).toEqual(['a', 'b'])
    expect(Object.keys(Lock.removeSkill(lock, 'b').skills)).toEqual(['a'])
    const dir = await tempDir('skills-lock-write-')
    const file = join(dir, 'skills.lock.json')
    await Lock.write(file, lock)
    const output = await readFile(file, 'utf-8')
    expect(output).toContain('"a"')
    expect(output.indexOf('"a"')).toBeLessThan(output.indexOf('"b"'))
  })

  test('ensures a missing lock file with default deterministic content', async () => {
    const dir = await tempDir('skills-lock-ensure-')
    const file = join(dir, 'nested', 'skills.lock.json')

    await expect(Lock.read(file)).rejects.toThrow()
    const lock = await Lock.ensure(lockScope(file))

    expect(lock).toEqual({ schemaVersion: 1, scope: 'project', skills: {} })
    expect(await readFile(file, 'utf-8')).toBe(`{
  "schemaVersion": 1,
  "scope": "project",
  "skills": {}
}
`)
  })
})

async function readLockFixture(input: unknown): Promise<Lock.Document> {
  const dir = await tempDir('skills-lock-invalid-')
  const file = join(dir, 'skills.lock.json')
  await writeFile(file, JSON.stringify(input))
  return await Lock.read(file)
}

function lockScope(lockPath: string): Scope {
  const dir = join(lockPath, '..')
  return {
    createGlobalDir: false,
    globalDir: dir,
    installDir: dir,
    lockPath,
    manifestPath: join(dir, 'skills.json'),
    scope: 'project'
  }
}
