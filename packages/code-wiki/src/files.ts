import type { Stats } from 'node:fs'
import { mkdir, mkdtemp, readdir, readlink, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { stableStringify } from './json.js'

export namespace Files {
  export type ErrorKind = 'not_found' | 'not_symbolic_link'

  export type FileInfo = Stats

  export async function pathExists(path: string): Promise<boolean> {
    try {
      await statPath(path)
      return true
    } catch (error) {
      if (isNotFound(error)) {
        return false
      }

      throw error
    }
  }

  export async function ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true })
  }

  export async function readDir(path: string): Promise<string[]> {
    return readdir(path)
  }

  export async function readText(path: string): Promise<string> {
    return Bun.file(path).text()
  }

  export async function readSymbolicLink(path: string): Promise<string> {
    return readlink(path)
  }

  export async function statPath(path: string): Promise<FileInfo> {
    return Bun.file(path).stat()
  }

  export async function writeText(path: string, content: string): Promise<void> {
    await mkdir(await parentDirForWritablePath(path), { recursive: true })
    await Bun.write(path, content)
  }

  export async function makeTempDir(options: { directory: string; prefix: string }): Promise<string> {
    return mkdtemp(join(options.directory, options.prefix))
  }

  export async function removePath(
    path: string,
    options: {
      force?: boolean
      recursive?: boolean
    }
  ): Promise<void> {
    await rm(path, options)
  }

  export async function readJson<T>(path: string, parse: (input: unknown) => T): Promise<T> {
    return parse(JSON.parse(await readText(path)))
  }

  export async function writeJson(path: string, value: unknown): Promise<void> {
    await writeText(path, stableStringify(value))
  }

  export function errorKind(error: unknown): ErrorKind | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return undefined
    }

    if (error.code === 'EINVAL' && isReadLinkError(error)) {
      return 'not_symbolic_link'
    }

    if (error.code === 'ENOENT') {
      return 'not_found'
    }

    return undefined
  }

  export function isNotFound(error: unknown): boolean {
    return errorKind(error) === 'not_found'
  }

  export function isNotSymbolicLinkReadError(error: unknown): boolean {
    return errorKind(error) === 'not_symbolic_link'
  }

  async function parentDirForWritablePath(path: string): Promise<string> {
    try {
      const target = await readlink(path)
      return dirname(isAbsolute(target) ? target : resolve(dirname(path), target))
    } catch (error) {
      if (isNotFound(error) || isNotSymbolicLinkReadError(error)) {
        return dirname(path)
      }

      try {
        await statPath(path)
        return dirname(path)
      } catch (statError) {
        if (isNotFound(statError)) {
          return dirname(path)
        }

        throw statError
      }
    }
  }

  function isReadLinkError(error: object): boolean {
    return 'syscall' in error && error.syscall === 'readlink'
  }
}
