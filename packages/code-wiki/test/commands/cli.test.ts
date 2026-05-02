import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { createCli } from '../../src/cli.js'
import { readJson, tempDir } from '../helpers/fs.js'
import { captureStdout, run, withCwd } from '../helpers/process.js'

describe('cli command groups', () => {
  test('prints root and group help through command-kit', async () => {
    const cli = createCli()

    const rootHelp = await captureStdout(async () => {
      await cli.serve(['--help'])
    })
    const projectsHelp = await captureStdout(async () => {
      await cli.serve(['projects', '--help'])
    })

    expect(rootHelp).toContain('code-wiki — PRD review-first code wiki CLI')
    expect(rootHelp).toContain('  runtime')
    expect(rootHelp).toContain('  projects')
    expect(projectsHelp).toContain('code-wiki projects — Manage shared CodeWiki projects')
    expect(projectsHelp).toContain('Usage: code-wiki projects <command>')
  })

  test('routes runtime commands through the command group', async () => {
    const cwd = await tempDir('code-wiki-cli-runtime-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)
    const cli = createCli()

    await withCwd(cwd, async () => {
      await cli.serve(['init', '--shared'])
      await cli.serve(['runtime', 'set', 'codex'])
    })
    const output = await captureStdout(() => withCwd(cwd, () => cli.serve(['runtime', 'current'])))

    expect(output).toBe('codex\n')
    expect(await readJson(join(cwd, '.code-wiki', 'config.json'))).toEqual({
      mode: 'shared',
      runtime: 'codex',
      schemaVersion: 1
    })
  })

  test('routes projects commands through the command group', async () => {
    const cwd = await tempDir('code-wiki-cli-projects-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)
    const cli = createCli()

    await withCwd(cwd, async () => {
      await cli.serve(['init', '--shared'])
      await cli.serve(['projects', 'add', 'web-app', '--repo', 'git@github.com:org/web-app.git'])
    })
    const output = await captureStdout(() => withCwd(cwd, () => cli.serve(['projects', 'list'])))

    expect(output).toContain('web-app\tgit@github.com:org/web-app.git\tHEAD')
  })
})
