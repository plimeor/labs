import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'zx'

import { Files } from '../files.js'

export type RuntimeId = 'codex'

export type RuntimeRunOptions = {
  cwd: string
  outputPath?: string
  prompt: string
}

export type RuntimeAdapter = {
  assertAvailable(): Promise<void>
  id: RuntimeId
  run(options: RuntimeRunOptions): Promise<string>
}

export const codexRuntime: RuntimeAdapter = {
  assertAvailable: assertCodexAvailable,
  id: 'codex',
  run: runCodex
}

async function assertCodexAvailable(): Promise<void> {
  const result = await $({ quiet: true })`which codex`.nothrow()
  if (result.exitCode !== 0) {
    throw new Error('Runtime executable not found on PATH for codex: codex')
  }
}

async function runCodex(options: RuntimeRunOptions): Promise<string> {
  await codexRuntime.assertAvailable()

  let tempDir: string | undefined
  let outputPath = options.outputPath
  if (!outputPath) {
    tempDir = await Files.makeTempDir({ directory: tmpdir(), prefix: 'code-wiki-' })
    outputPath = join(tempDir, 'last-message.md')
  }

  try {
    const command = constructCodexRuntimeCommand({
      cwd: options.cwd,
      outputPath,
      prompt: options.prompt
    })
    await $({
      cwd: options.cwd,
      input: command.input,
      quiet: true
    })`${command.command} ${command.args}`
    return await Files.readText(outputPath)
  } finally {
    if (tempDir) {
      await Files.removePath(tempDir, { force: true, recursive: true })
    }
  }
}

export function constructCodexRuntimeCommand(options: { cwd: string; outputPath: string; prompt: string }) {
  return {
    command: 'codex',
    input: options.prompt,
    args: [
      '--ask-for-approval',
      'never',
      'exec',
      '--skip-git-repo-check',
      '--sandbox',
      'read-only',
      '--output-last-message',
      options.outputPath,
      '--cd',
      options.cwd,
      '-'
    ]
  }
}
