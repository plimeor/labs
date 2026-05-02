import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { initCommand } from '../../src/commands/init.js'
import { projectsAddCommand, projectsListCommand } from '../../src/commands/projects.js'
import { readJson, tempDir } from '../helpers/fs.js'
import { captureStdout, run, withCwd } from '../helpers/process.js'

describe('init and projects commands', () => {
  test('initializes a shared wiki and registers portable projects by repo URL', async () => {
    const cwd = await tempDir('code-wiki-init-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)

    await withCwd(cwd, async () => {
      await initCommand({ options: { shared: true } })
      await projectsAddCommand({
        args: { project: 'Web App' },
        options: { repo: 'git@github.com:org/web-app.git' }
      })
    })

    expect(await readJson(join(cwd, '.code-wiki', 'config.json'))).toEqual({
      mode: 'shared',
      schemaVersion: 1
    })
    expect(await readJson(join(cwd, '.code-wiki', 'projects.json'))).toEqual({
      schemaVersion: 1,
      projects: [
        {
          defaultBranch: 'HEAD',
          displayName: 'web-app',
          id: 'web-app',
          managedRepoPath: join('.code-wiki', 'repos', 'web-app'),
          repoUrl: 'git@github.com:org/web-app.git',
          wikiPath: join('.code-wiki', 'projects', 'web-app')
        }
      ]
    })
    expect(await readFile(join(cwd, '.code-wiki', '.gitignore'), 'utf-8')).toBe('repos/\n')

    const output = await captureStdout(() => withCwd(cwd, () => projectsListCommand()))
    expect(output).toContain('web-app\tgit@github.com:org/web-app.git\tHEAD')
  })
})
