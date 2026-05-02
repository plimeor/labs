import { $ } from 'zx'

export async function withCwd<T>(cwd: string, callback: () => Promise<T>): Promise<T> {
  const previousCwd = process.cwd()
  process.chdir(cwd)
  try {
    return await callback()
  } finally {
    process.chdir(previousCwd)
  }
}

export async function captureStdout(callback: () => Promise<void>): Promise<string> {
  let output = ''
  const write = process.stdout.write
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString()
    return true
  }) as typeof process.stdout.write

  try {
    await callback()
    return output
  } finally {
    process.stdout.write = write
  }
}

export async function run(command: string, args: string[], cwd: string): Promise<void> {
  const output = await $({
    cwd,
    quiet: true
  })`${command} ${args}`.nothrow()

  if (output.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${output.stderr || output.stdout}`)
  }
}
