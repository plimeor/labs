import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'zx'

import { resolveSource } from './source.js'

export namespace Checkout {
  export type Request = {
    commit?: string
    ref?: string
    source: string
  }

  export type Result = {
    commit: string
    dir: string
    key: string
    source: string
  }

  type Prepared = Result & {
    tempDir?: string
  }

  export function key(request: Request): string {
    return [request.source, request.commit ?? request.ref ?? 'HEAD'].join('\0')
  }

  function uniqueRequests(requests: Request[]): Request[] {
    const grouped = new Map<string, Request>()
    for (const request of requests) {
      grouped.set(key(request), request)
    }
    return [...grouped.values()]
  }

  export async function withAll<T>(
    requests: Request[],
    callback: (checkouts: Map<string, Result>) => Promise<T>
  ): Promise<T> {
    const checkouts = await Promise.all(uniqueRequests(requests).map(prepare))
    const tempDirs = checkouts
      .map(checkout => checkout.tempDir)
      .filter((tempDir): tempDir is string => Boolean(tempDir))

    try {
      return await callback(new Map(checkouts.map(({ tempDir: _tempDir, ...checkout }) => [checkout.key, checkout])))
    } finally {
      await Promise.all(tempDirs.map(tempDir => rm(tempDir, { force: true, recursive: true })))
    }
  }

  export function requireResult(checkouts: Map<string, Result>, request: Request, skillName: string): Result {
    const checkout = checkouts.get(key(request))
    if (!checkout) {
      throw new Error(`Missing checkout for ${skillName}`)
    }

    return checkout
  }

  async function prepare(request: Request): Promise<Prepared> {
    const resolved = resolveSource(request.source)
    const checkoutKey = key(request)

    if (resolved.type === 'local') {
      return {
        commit: await resolveLocalCommit(resolved.localPath),
        dir: resolved.localPath,
        key: checkoutKey,
        source: request.source
      }
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'skills-checkout-'))
    const checkoutDir = join(tempDir, 'repo')

    try {
      if (request.commit) {
        await git(['clone', '--no-checkout', resolved.gitUrl, checkoutDir])
        await git(['checkout', request.commit], checkoutDir)
      } else if (request.ref) {
        await git(['clone', '--depth', '1', '--branch', request.ref, resolved.gitUrl, checkoutDir])
      } else {
        await git(['clone', '--depth', '1', resolved.gitUrl, checkoutDir])
      }

      return {
        commit: await git(['rev-parse', 'HEAD'], checkoutDir),
        dir: checkoutDir,
        key: checkoutKey,
        source: request.source,
        tempDir
      }
    } catch (error) {
      await rm(tempDir, { force: true, recursive: true })
      throw error
    }
  }

  async function git(args: string[], cwd?: string): Promise<string> {
    try {
      const output = await $({ cwd, quiet: true })`git ${args}`
      return output.text().trim()
    } catch (error) {
      throw new Error(formatGitError(args, error))
    }
  }

  async function resolveLocalCommit(localPath: string): Promise<string> {
    try {
      return await git(['rev-parse', 'HEAD'], localPath)
    } catch {
      return 'local'
    }
  }

  function formatGitError(args: string[], error: unknown): string {
    if (typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string') {
      return error.stderr.trim() || `git ${args.join(' ')} failed`
    }

    if (error instanceof Error) {
      return error.message
    }

    return String(error)
  }
}
