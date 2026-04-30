import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { initCommand } from '../../src/commands/init.js'
import { projectAddCommand, projectListCommand, projectSetCommand } from '../../src/commands/project.js'
import { readJson, tempDir } from '../helpers/fs.js'
import { captureStdout, run, withCwd } from '../helpers/process.js'

describe('init and project commands', () => {
  test('initializes a wiki and registers portable projects by repo URL and branch', async () => {
    const cwd = await tempDir('code-wiki-init-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)

    await withCwd(cwd, async () => {
      await initCommand()
      await projectAddCommand({
        args: { project: 'Web App' },
        options: { branch: 'main', repo: 'git@github.com:org/web-app.git' }
      })
    })

    expect(await readJson(join(cwd, '.code-wiki', 'config.json'))).toEqual({
      schemaVersion: 1
    })
    expect(await readJson(join(cwd, '.code-wiki', 'projects.json'))).toEqual({
      schemaVersion: 1,
      projects: [
        {
          branch: 'main',
          id: 'web-app',
          repoUrl: 'git@github.com:org/web-app.git'
        }
      ]
    })
    expect(await readFile(join(cwd, '.code-wiki', '.gitignore'), 'utf-8')).toBe('repos/\nprojects/\nreports/\n')

    const output = await captureStdout(() => withCwd(cwd, () => projectListCommand()))
    expect(output).toContain('web-app\tgit@github.com:org/web-app.git\tmain')
  })

  test('updates a project ref with the project set command', async () => {
    const cwd = await tempDir('code-wiki-project-set-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)

    await withCwd(cwd, async () => {
      await initCommand()
      await projectAddCommand({
        args: { project: 'react' },
        options: { repo: 'https://github.com/facebook/react.git', tag: 'v15.6.2' }
      })
      await projectSetCommand({
        args: { project: 'react' },
        options: { commit: 'v16.14.0' }
      })
    })

    expect(await readJson(join(cwd, '.code-wiki', 'projects.json'))).toMatchObject({
      projects: [
        {
          commit: 'v16.14.0',
          id: 'react',
          repoUrl: 'https://github.com/facebook/react.git'
        }
      ]
    })
  })
})
