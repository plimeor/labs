import { describe, expect, test } from 'bun:test'

import { codexRuntime, constructCodexRuntimeCommand } from '../src/runtime/index.js'

describe('runtime adapter contract', () => {
  test('keeps codex as the internal default runtime adapter', () => {
    expect(codexRuntime.id).toBe('codex')

    const command = constructCodexRuntimeCommand({
      cwd: '/tmp/workspace',
      outputPath: '/tmp/output.md',
      prompt: 'Scan context'
    })
    expect(command.command).toBe('codex')
    expect(command.input).toBe('Scan context')
    expect(command.args).toEqual([
      '--ask-for-approval',
      'never',
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--output-last-message',
      '/tmp/output.md',
      '--cd',
      '/tmp/workspace',
      '-'
    ])
  })
})
