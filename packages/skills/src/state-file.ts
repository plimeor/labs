import { lstat, mkdir, readlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'

import { isNotFound } from './json.js'

export async function writeTextFilePreservingFile(path: string, content: string): Promise<void> {
  await mkdir(await parentDirForWritablePath(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
}

async function parentDirForWritablePath(path: string): Promise<string> {
  try {
    const stats = await lstat(path)
    if (!stats.isSymbolicLink()) {
      return dirname(path)
    }
  } catch (error) {
    if (isNotFound(error)) {
      return dirname(path)
    }

    throw error
  }

  const target = await readlink(path)
  return dirname(isAbsolute(target) ? target : resolve(dirname(path), target))
}
