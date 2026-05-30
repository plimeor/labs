import { copyFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Browsers hold exclusive locks on their cookie/storage databases while
 * running, and reading the live files risks corruption. Every adapter copies
 * the on-disk data into a throwaway temp directory and reads the copy.
 */
export async function withTempCopy<T>(
  source: string,
  kind: 'file' | 'dir',
  read: (copyPath: string) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'browser-peek-'))
  const target = join(dir, 'data')

  try {
    if (kind === 'file') {
      await copyFile(source, target)
    } else {
      await cp(source, target, { recursive: true })
      // LevelDB refuses to open while a LOCK file is present; the copy is
      // disposable so dropping it is safe.
      await rm(join(target, 'LOCK'), { force: true })
    }

    return await read(target)
  } finally {
    await rm(dir, { force: true, recursive: true })
  }
}
