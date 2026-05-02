import { afterEach, describe, expect, test } from 'bun:test'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'

import { $ } from 'zx'

import { createCli } from '../../src/cli.js'
import { readText, tempDir } from '../helpers/fs.js'
import { captureStdout, run, withCwd } from '../helpers/process.js'

const originalPath = process.env.PATH

afterEach(() => {
  process.env.PATH = originalPath
})

describe('query command', () => {
  test('answers with runtime context from multiple scanned wiki versions', async () => {
    const remote = await tempDir('code-wiki-query-remote-')
    await run('git', ['init', '-q', '-b', 'main'], remote)
    await mkdir(join(remote, 'src'), { recursive: true })
    await writeFile(join(remote, 'src', 'index.ts'), 'export function LegacyRenderer() { return "legacy" }\n')
    await run('git', ['add', '.'], remote)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'legacy'], remote)
    const legacyCommit = (await $({ cwd: remote, quiet: true })`git rev-parse HEAD`).stdout.trim()

    await writeFile(join(remote, 'src', 'index.ts'), 'export function ModernRenderer() { return "modern" }\n')
    await run('git', ['add', '.'], remote)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'modern'], remote)
    const modernCommit = (await $({ cwd: remote, quiet: true })`git rev-parse HEAD`).stdout.trim()

    const cwd = await tempDir('code-wiki-query-workspace-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)
    const binDir = await tempDir('code-wiki-query-bin-')
    await writeFile(
      join(binDir, 'codex'),
      [
        '#!/bin/sh',
        'output=""',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "--output-last-message" ]; then',
        '    shift',
        '    output="$1"',
        '  fi',
        '  shift',
        'done',
        'input="$(cat)"',
        'printf "%s\\n%s\\n" "FAKE CODEX ANSWER" "$input" > "$output"'
      ].join('\n')
    )
    await chmod(join(binDir, 'codex'), 0o755)
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ''}`

    const cli = createCli()
    await withCwd(cwd, async () => {
      await cli.serve(['init', '--shared'])
      await cli.serve(['runtime', 'set', 'codex'])
      await cli.serve(['project', 'add', 'react', '--repo', remote, '--commit', legacyCommit])
      await cli.serve(['scan', 'react'])
      await cli.serve(['project', 'set', 'react', '--commit', modernCommit])
      await cli.serve(['scan', 'react'])
    })

    const output = await captureStdout(() =>
      withCwd(cwd, () =>
        cli.serve([
          'query',
          'react',
          '两个版本之间的差异是什么？',
          '--commits',
          `${legacyCommit.slice(0, 8)},${modernCommit.slice(0, 8)}`
        ])
      )
    )

    expect(output).toContain('FAKE CODEX ANSWER')
    expect(output).toContain('Question: react 两个版本之间的差异是什么？')
    expect(output).toContain(`${legacyCommit}`)
    expect(output).toContain(`${modernCommit}`)
    expect(output).toContain('Version Deltas')
    expect(output).toContain('LegacyRenderer')
    expect(output).toContain('ModernRenderer')
    expect(await readText(join(cwd, '.code-wiki', 'projects', 'react', 'versions.json'))).toContain(legacyCommit)
  })
})
