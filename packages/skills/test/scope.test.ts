import { describe, expect, test } from 'bun:test'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveScope } from '../src/scope.js'
import { tempDir } from './helpers/fs.js'
import { withCwd, withHome } from './helpers/process.js'

describe('scope planning', () => {
  test('maps global scope to ~/.agents state paths', async () => {
    await withHome('/home/me', async () => {
      expect(resolveScope(true)).toEqual({
        createGlobalDir: true,
        globalDir: join('/home/me', '.agents'),
        installDir: join('/home/me', '.agents', 'skills'),
        lockPath: join('/home/me', '.agents', 'skills.lock.json'),
        manifestPath: join('/home/me', '.agents', 'skills.json'),
        scope: 'global'
      })
    })
  })

  test('maps project scope to ./.agents state paths', async () => {
    const cwd = await realpath(await tempDir('skills-scope-'))
    await withHome('/home/me', () =>
      withCwd(cwd, async () => {
        expect(resolveScope()).toEqual({
          createGlobalDir: false,
          globalDir: join('/home/me', '.agents'),
          installDir: join(cwd, '.agents', 'skills'),
          lockPath: join(cwd, '.agents', 'skills.lock.json'),
          manifestPath: join(cwd, '.agents', 'skills.json'),
          scope: 'project'
        })
      })
    )
  })
})
