import { describe, expect, test } from 'bun:test'

import { constructRuntimeCommand, executableForRuntime } from '../../src/runtime/index.js'

describe('runtime contract', () => {
  test('supports codex as the only runtime command contract', () => {
    expect(executableForRuntime('codex')).toBe('codex')

    const command = constructRuntimeCommand('codex', 'Scan context', '/tmp/output.md', '/tmp/workspace')
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
