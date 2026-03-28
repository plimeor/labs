export async function withCwd<T>(cwd: string, callback: () => Promise<T>): Promise<T> {
  const previousCwd = process.cwd()
  process.chdir(cwd)
  try {
    return await callback()
  } finally {
    process.chdir(previousCwd)
  }
}

export async function withHome<T>(home: string, callback: () => Promise<T>): Promise<T> {
  const previousHome = process.env.HOME
  process.env.HOME = home
  try {
    return await callback()
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = previousHome
    }
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
