import { describe, expect, test } from 'bun:test'
import { realpath } from 'node:fs/promises'

import { resolveSource } from '../src/source.js'
import { tempDir } from './helpers/fs.js'
import { withCwd } from './helpers/process.js'

describe('source resolution', () => {
  test('normalizes GitHub shorthand without treating it as a local path', () => {
    expect(resolveSource('plimeor/agent-skills')).toEqual({
      gitUrl: 'https://github.com/plimeor/agent-skills.git',
      input: 'plimeor/agent-skills',
      type: 'git'
    })
  })

  test('resolves relative local paths against cwd', async () => {
    const cwd = await realpath(await tempDir('skills-source-'))
    await withCwd(cwd, async () => {
      expect(resolveSource('./skills')).toEqual({
        input: './skills',
        localPath: `${cwd}/skills`,
        type: 'local'
      })
    })
  })
})
