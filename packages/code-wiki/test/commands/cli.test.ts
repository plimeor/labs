import { describe, expect, test } from 'bun:test'

import { createCli } from '../../src/cli.js'
import { tempDir } from '../helpers/fs.js'
import { captureStdout, run, withCwd } from '../helpers/process.js'

describe('cli command groups', () => {
  test('prints root and group help through command-kit', async () => {
    const cli = createCli()

    const rootHelp = await captureStdout(async () => {
      await cli.serve(['--help'])
    })
    const projectHelp = await captureStdout(async () => {
      await cli.serve(['project', '--help'])
    })

    expect(rootHelp).toContain('code-wiki — Code wiki CLI for scanning repositories into durable Markdown wikis')
    expect(rootHelp).toContain('  init')
    expect(rootHelp).toContain('  project')
    expect(rootHelp).toContain('  scan')
    expect(rootHelp).not.toContain('  runtime')
    expect(rootHelp).not.toContain('  query')
    expect(rootHelp).not.toContain('  context')
    expect(rootHelp).not.toContain('  review')
    expect(rootHelp).not.toContain('  correct')
    expect(projectHelp).toContain('code-wiki project — Manage scanned CodeWiki projects')
    expect(projectHelp).toContain('Usage: code-wiki project <command>')
  })

  test('routes project commands through the command group', async () => {
    const cwd = await tempDir('code-wiki-cli-projects-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)
    const cli = createCli()

    await withCwd(cwd, async () => {
      await cli.serve(['init', '--shared'])
      await cli.serve(['project', 'add', 'web-app', '--repo', 'git@github.com:org/web-app.git', '--ref', 'main'])
      await cli.serve(['project', 'set', 'web-app', '--ref', 'v1'])
    })
    const output = await captureStdout(() => withCwd(cwd, () => cli.serve(['project', 'list'])))

    expect(output).toContain('web-app\tgit@github.com:org/web-app.git\tv1')
  })
})
