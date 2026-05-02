import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'zx'

import { Files } from '../files.js'
import type { RuntimeId } from '../types.js'

export type RuntimeCommand = {
  args: string[]
  command: string
  input?: string
}

export type RuntimeRunOptions = {
  cwd: string
  prompt: string
  runtime: RuntimeId
}

export function executableForRuntime(runtime: RuntimeId): string {
  switch (runtime) {
    case 'codex':
      return 'codex'
    case 'claude-code':
      return 'claude'
    case 'cursor':
      return 'cursor'
    case 'kiro':
      return 'kiro'
  }
}

export async function assertRuntimeAvailable(runtime: RuntimeId): Promise<void> {
  const executable = executableForRuntime(runtime)
  const result = await $({ quiet: true })`which ${executable}`.nothrow()
  if (result.exitCode !== 0) {
    throw new Error(`Runtime executable not found on PATH for ${runtime}: ${executable}`)
  }
}

export async function runRuntime(options: RuntimeRunOptions): Promise<string> {
  await assertRuntimeAvailable(options.runtime)
  if (options.runtime !== 'codex') {
    throw new Error(`${options.runtime} is registered as a runtime id, but only codex is end-to-end supported.`)
  }

  const tempDir = await Files.makeTempDir({ directory: tmpdir(), prefix: 'code-wiki-' })
  const outputPath = join(tempDir, 'last-message.md')
  try {
    const command = constructRuntimeCommand(options.runtime, options.prompt, outputPath, options.cwd)
    await $({
      cwd: options.cwd,
      input: command.input,
      quiet: true
    })`${command.command} ${command.args}`
    return await Files.readText(outputPath)
  } finally {
    await Files.removePath(tempDir, { force: true, recursive: true })
  }
}

export function constructRuntimeCommand(
  runtime: RuntimeId,
  prompt: string,
  outputPath: string,
  cwd: string
): RuntimeCommand {
  switch (runtime) {
    case 'codex':
      return {
        command: 'codex',
        input: prompt,
        args: [
          '--ask-for-approval',
          'never',
          'exec',
          '--skip-git-repo-check',
          '--sandbox',
          'read-only',
          '--output-last-message',
          outputPath,
          '--cd',
          cwd,
          '-'
        ]
      }
    case 'claude-code':
      return {
        args: ['-p', prompt],
        command: 'claude'
      }
    case 'cursor':
      return {
        args: ['agent', prompt],
        command: 'cursor'
      }
    case 'kiro':
      return {
        args: ['run', prompt],
        command: 'kiro'
      }
  }
}
