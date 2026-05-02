import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { initCommand } from '../../src/commands/init.js'
import { projectAddCommand, projectListCommand, projectSetCommand } from '../../src/commands/project.js'
import { readJson, tempDir } from '../helpers/fs.js'
import { captureStdout, run, withCwd } from '../helpers/process.js'

describe('init and project commands', () => {
  test('initializes a shared wiki and registers portable projects by repo URL and ref', async () => {
    const cwd = await tempDir('code-wiki-init-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)

    await withCwd(cwd, async () => {
      await initCommand({ options: { shared: true } })
      await projectAddCommand({
        args: { project: 'Web App' },
        options: { include: 'src/**,package.json', ref: 'v1.2.3', repo: 'git@github.com:org/web-app.git' }
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
          displayName: 'web-app',
          id: 'web-app',
          include: ['src/**', 'package.json'],
          managedRepoPath: join('.code-wiki', 'repos', 'web-app'),
          ref: 'v1.2.3',
          repoUrl: 'git@github.com:org/web-app.git',
          wikiPath: join('.code-wiki', 'projects', 'web-app')
        }
      ]
    })
    expect(await readFile(join(cwd, '.code-wiki', '.gitignore'), 'utf-8')).toBe('repos/\n')

    const output = await captureStdout(() => withCwd(cwd, () => projectListCommand()))
    expect(output).toContain('web-app\tgit@github.com:org/web-app.git\tv1.2.3')
  })

  test('updates a project ref with the project set command', async () => {
    const cwd = await tempDir('code-wiki-project-set-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)

    await withCwd(cwd, async () => {
      await initCommand({ options: { shared: true } })
      await projectAddCommand({
        args: { project: 'react' },
        options: { ref: 'v15.6.2', repo: 'https://github.com/facebook/react/tree/main' }
      })
      await projectSetCommand({
        args: { project: 'react' },
        options: { commit: 'v16.14.0' }
      })
    })

    expect(await readJson(join(cwd, '.code-wiki', 'projects.json'))).toMatchObject({
      projects: [
        {
          id: 'react',
          ref: 'v16.14.0',
          repoUrl: 'https://github.com/facebook/react.git'
        }
      ]
    })
  })
})
