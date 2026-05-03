import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, stat as readStat, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { $ } from 'bun'

import * as Git from '@plimeor/git-kit'

describe('git-kit', () => {
  test('stat reports repository identity on branches and detached HEAD', async () => {
    const { commit, source } = await createGitSource()
    const checkout = await Git.clone({ ref: 'main', repo: `file://${source}` })
    try {
      expect(await Git.stat(checkout.path)).toMatchObject({
        HEAD: commit,
        identity: `${basename(dirname(source))}__${basename(source)}`,
        path: checkout.path,
        ref: 'main',
        repo: `file://${source}`
      })

      await Git.switch({ detach: true, path: checkout.path, ref: commit })
      expect(await Git.stat(checkout.path)).toMatchObject({
        HEAD: commit,
        ref: 'HEAD'
      })
    } finally {
      await checkout.dispose?.()
    }
  })

  test('clone supports target paths, temporary paths, refs, and skipExisting', async () => {
    const { commit, source } = await createGitSource()
    const target = await tempDir('git-kit-target-')
    const targetRepo = await realpath(join(target, 'repo')).catch(() => join(target, 'repo'))

    const first = await Git.clone({ path: join(target, 'repo'), ref: 'main', repo: `file://${source}` })
    expect(first).toMatchObject({ HEAD: commit, path: await realpath(targetRepo), ref: 'main' })
    expect(first.dispose).toBeUndefined()

    const second = await Git.clone({ path: join(target, 'repo'), repo: `file://${source}`, skipExisting: true })
    expect(second).toMatchObject({ HEAD: commit, path: await realpath(targetRepo), ref: 'main' })

    const temporary = await Git.clone({ ref: commit, repo: `file://${source}` })
    const temporaryPath = temporary.path
    expect(temporary.HEAD).toBe(commit)
    await temporary.dispose?.()
    await expect(readStat(temporaryPath)).rejects.toThrow()
  })

  test('clone rejects skipExisting when origin does not match', async () => {
    const existing = await createGitSource()
    const requested = await createGitSource()
    const target = await tempDir('git-kit-target-')

    await Git.clone({ path: join(target, 'repo'), repo: `file://${existing.source}` })

    await expect(
      Git.clone({ path: join(target, 'repo'), repo: `file://${requested.source}`, skipExisting: true })
    ).rejects.toThrow('Existing checkout origin does not match requested repo')
  })

  test('clone cleans temporary directories when checkout fails', async () => {
    const { source } = await createGitSource()
    const before = await cloneTempDirs()
    const checkout = Git.clone({ ref: 'missing', repo: `file://${source}` })

    await expect(checkout).rejects.toThrow()
    expect(await cloneTempDirs()).toEqual(before)
  })

  test('clone normalizes GitHub shorthand to an origin URL', async () => {
    const { commit, source } = await createGitSource()
    const config = await tempDir('git-kit-config-')
    const configPath = join(config, 'gitconfig')
    await writeFile(configPath, `[url "file://${source}"]\n\tinsteadOf = https://github.com/plimeor/agent-skills.git\n`)
    const previousConfig = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = configPath
    try {
      const checkout = await Git.clone({ repo: 'plimeor/agent-skills' })
      try {
        expect(checkout.HEAD).toBe(commit)
      } finally {
        await checkout.dispose?.()
      }
    } finally {
      if (previousConfig === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL
      } else {
        process.env.GIT_CONFIG_GLOBAL = previousConfig
      }
    }
  })

  test('clone rejects local paths', async () => {
    await expect(Git.clone({ repo: '../agent-skills' })).rejects.toThrow('Local paths are not supported')
  })

  test('fetch resolves branches tags commits and remote HEAD', async () => {
    const { commit, pullRef, releaseCommit, source, tag } = await createGitSource()
    const checkout = await Git.clone({ repo: `file://${source}` })
    try {
      expect(await Git.fetch({ path: checkout.path, ref: 'main' })).toEqual({ HEAD: commit, ref: 'main' })
      expect(await Git.fetch({ path: checkout.path, ref: 'release' })).toEqual({ HEAD: releaseCommit, ref: 'release' })
      expect(await Git.fetch({ path: checkout.path, ref: tag })).toEqual({ HEAD: commit, ref: tag })
      expect(await Git.fetch({ path: checkout.path, ref: commit })).toEqual({ HEAD: commit, ref: commit })
      expect(await Git.fetch({ path: checkout.path, ref: pullRef })).toEqual({ HEAD: commit, ref: pullRef })
      expect(await Git.fetch({ path: checkout.path, ref: 'HEAD' })).toEqual({ HEAD: commit, ref: 'main' })
    } finally {
      await checkout.dispose?.()
    }
  })

  test('switch supports normal and detached checkout', async () => {
    const { commit, releaseCommit, source } = await createGitSource()
    const checkout = await Git.clone({ repo: `file://${source}` })
    try {
      expect(await Git.switch({ path: checkout.path, ref: 'release' })).toEqual({
        HEAD: releaseCommit,
        ref: 'release'
      })
      expect(await Git.switch({ detach: true, path: checkout.path, ref: commit })).toEqual({
        HEAD: commit,
        ref: 'HEAD'
      })
    } finally {
      await checkout.dispose?.()
    }
  })

  test('collectIgnorePaths returns collected ignore paths', async () => {
    const { source } = await createGitSource()
    await mkdir(join(source, 'docs'), { recursive: true })
    await mkdir(join(source, 'src'), { recursive: true })
    await writeFile(join(source, '.gitignore'), 'ignored.txt\ndocs/\nmissing.txt\n# comment\n!kept.txt\n')
    await writeFile(join(source, 'src', '.gitignore'), 'nested.ts\n')
    await writeFile(join(source, 'ignored.txt'), 'ignored\n')
    await writeFile(join(source, 'kept.txt'), 'kept\n')

    expect(await Git.collectIgnorePaths(source)).toEqual(
      new Set([
        join(source, 'docs'),
        join(source, 'ignored.txt'),
        join(source, 'missing.txt'),
        join(source, 'src', 'nested.ts')
      ])
    )
  })
})

async function createGitSource(): Promise<{
  commit: string
  pullRef: string
  releaseCommit: string
  source: string
  tag: string
}> {
  const source = await tempDir('git-kit-source-')
  await $`git init -b main`.cwd(source).quiet()
  await writeFile(join(source, 'README.md'), 'main\n')
  await $`git add README.md`.cwd(source).quiet()
  await $`git -c user.email=git-kit@example.com -c user.name=GitKit commit -m main`.cwd(source).quiet()
  const commit = await $`git rev-parse HEAD`.cwd(source).quiet().text()
  const tag = 'v1.0.0'
  const pullRef = 'pull/1/head'
  await $`git tag ${tag}`.cwd(source).quiet()
  await $`git update-ref ${`refs/${pullRef}`} ${commit}`.cwd(source).quiet()
  await $`git checkout -b release`.cwd(source).quiet()
  await writeFile(join(source, 'README.md'), 'release\n')
  await $`git add README.md`.cwd(source).quiet()
  await $`git -c user.email=git-kit@example.com -c user.name=GitKit commit -m release`.cwd(source).quiet()
  const releaseCommit = await $`git rev-parse HEAD`.cwd(source).quiet().text()
  await $`git checkout main`.cwd(source).quiet()
  return { commit, pullRef, releaseCommit, source, tag }
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

async function cloneTempDirs(): Promise<string[]> {
  const entries = await readdir(tmpdir(), { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('git-kit-clone-'))
    .map(entry => entry.name)
    .sort()
}
