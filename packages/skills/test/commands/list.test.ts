import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { listCommand } from '../../src/commands/list.js'
import { tempDir, writeProjectLock } from '../helpers/fs.js'
import { withCwd } from '../helpers/process.js'

describe('list command', () => {
  test('returns installed skills from the lock file for JSON output', async () => {
    const cwd = await tempDir('skills-list-')
    await writeProjectLock(cwd, {
      schemaVersion: 1,
      scope: 'project',
      skills: {
        a: {
          commit: 'aaa',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: join(cwd, '.agents', 'skills', 'a'),
          method: 'copy',
          source: 'repo-a'
        },
        b: {
          commit: 'bbb',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: join(cwd, '.agents', 'skills', 'b'),
          method: 'copy',
          source: 'repo-b'
        }
      }
    })

    const entries = await withCwd(cwd, () => listCommand({ options: { json: true } }))

    expect(entries).toEqual([
      {
        commit: 'aaa',
        name: 'a',
        path: join(cwd, '.agents', 'skills', 'a'),
        scope: 'project',
        source: 'repo-a'
      },
      {
        commit: 'bbb',
        name: 'b',
        path: join(cwd, '.agents', 'skills', 'b'),
        scope: 'project',
        source: 'repo-b'
      }
    ])
  })
})
