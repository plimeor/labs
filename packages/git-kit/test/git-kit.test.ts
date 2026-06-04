import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, stat as readStat, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { $ } from 'bun'

import * as Git from '@plimeor/git-kit'

let sharedSource: GitSource
const temporaryDirs = new Set<string>()

describe('git-kit', () => {
  beforeAll(async () => {
    sharedSource = await createGitSource()
  })

  afterAll(async () => {
    await Promise.all([...temporaryDirs].map(path => rm(path, { force: true, recursive: true })))
  })

  test('repositories expose reusable lowercase identities', () => {
    expect(Git.repository('plimeor/agent-skills').identity).toBe('plimeor__agent-skills')
    expect(Git.repository('https://github.com/plimeor/agent-skills.git').identity).toBe('plimeor__agent-skills')
    expect(Git.repository('https://github.com/plimeor/agent_skills.git').identity).toBe('plimeor__agent_skills')
  })

  test('checkout snapshots report repository identity on branches and detached HEAD', async () => {
    const { commit, source } = sharedSource
    const checkout = await Git.checkout({ ref: 'main', source: `file://${source}` })
    const temporaryPath = checkout.directory
    try {
      expect(checkout.snapshot()).toMatchObject({
        currentRef: 'main',
        directory: checkout.directory,
        headSha: commit,
        identity: Git.repository(`file://${source}`).identity,
        source: `file://${source}`
      })

      await checkout.switch({ detach: true, ref: commit })
      expect(checkout.snapshot()).toMatchObject({
        currentRef: 'HEAD',
        headSha: commit
      })
    } finally {
      await checkout.dispose()
    }

    await expect(readStat(temporaryPath)).rejects.toThrow()
    await expect(readStat(dirname(temporaryPath))).rejects.toThrow()
  })

  test('checkout supports target directories, refs, and existing worktrees', async () => {
    const { commit, releaseCommit, source } = sharedSource
    const target = await tempDir('git-kit-target-')
    const targetRepo = await realpath(join(target, 'repo')).catch(() => join(target, 'repo'))

    const first = await Git.checkout({ directory: join(target, 'repo'), ref: 'release', source: `file://${source}` })
    expect(first.snapshot()).toMatchObject({
      currentRef: 'release',
      directory: await realpath(targetRepo),
      headSha: releaseCommit
    })

    const second = await Git.checkout({
      directory: join(target, 'repo'),
      reuseExisting: true,
      source: `file://${source}`
    })
    expect(second.snapshot()).toMatchObject({
      currentRef: 'main',
      directory: await realpath(targetRepo),
      headSha: commit
    })

    expect(first.headSha).toBe(releaseCommit)
  })

  test('checkout rejects existing worktrees when origin does not match', async () => {
    const existing = sharedSource
    const requestedSource = join(await tempDir('git-kit-source-'), 'repo')
    const target = await tempDir('git-kit-target-')

    await Git.checkout({ directory: join(target, 'repo'), source: `file://${existing.source}` })

    await expect(
      Git.checkout({ directory: join(target, 'repo'), reuseExisting: true, source: `file://${requestedSource}` })
    ).rejects.toThrow('Existing checkout origin does not match requested source')
  })

  test('checkout cleans temporary directories when checkout fails', async () => {
    const { source } = sharedSource
    const before = await checkoutTempDirs()
    const checkout = Git.checkout({ ref: 'missing', source: `file://${source}` })

    await expect(checkout).rejects.toThrow()
    const createdRoots = (await checkoutTempDirs()).filter(path => !before.includes(path))
    expect(createdRoots).toHaveLength(0)
    await Promise.all(createdRoots.map(path => rm(path, { force: true, recursive: true })))
  })

  test('checkout normalizes GitHub shorthand to an origin URL', async () => {
    const { commit, source } = sharedSource
    const config = await tempDir('git-kit-config-')
    const configPath = join(config, 'gitconfig')
    await writeFile(configPath, `[url "file://${source}"]\n\tinsteadOf = https://github.com/plimeor/agent-skills.git\n`)
    const previousConfig = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = configPath
    try {
      const checkout = await Git.checkout({ source: 'plimeor/agent-skills' })
      try {
        expect(checkout.headSha).toBe(commit)
      } finally {
        await checkout.dispose()
      }
    } finally {
      if (previousConfig === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL
      } else {
        process.env.GIT_CONFIG_GLOBAL = previousConfig
      }
    }
  })

  test('checkout rejects local paths', async () => {
    await expect(Git.checkout({ source: '../agent-skills' })).rejects.toThrow('Local paths are not supported')
  })

  test('fetch resolves branches tags commits and remote HEAD', async () => {
    const { commit, releaseCommit, source, tag } = sharedSource
    const checkout = await Git.checkout({ source: `file://${source}` })
    try {
      expect(await checkout.fetch('release')).toEqual({ headSha: releaseCommit, ref: 'release' })
      expect(await checkout.fetch(tag)).toEqual({ headSha: commit, ref: tag })
      expect(await checkout.fetch(commit)).toEqual({ headSha: commit, ref: commit })
      expect(await checkout.fetch('HEAD')).toEqual({ headSha: commit, ref: 'main' })
    } finally {
      await checkout.dispose()
    }
  })

  test('collectIgnorePaths returns collected ignore paths', async () => {
    const source = await createEmptyGitWorktree()
    await mkdir(join(source, 'docs'), { recursive: true })
    await mkdir(join(source, 'src'), { recursive: true })
    await writeFile(join(source, '.gitignore'), 'ignored.txt\ndocs/\nmissing.txt\n# comment\n!kept.txt\n')
    await writeFile(join(source, 'src', '.gitignore'), 'nested.ts\n')
    await writeFile(join(source, 'ignored.txt'), 'ignored\n')
    await writeFile(join(source, 'kept.txt'), 'kept\n')

    const checkout = await Git.openWorktree(source)
    const root = checkout.directory
    expect(await checkout.collectIgnorePaths()).toEqual(
      new Set([
        join(root, 'docs'),
        join(root, 'ignored.txt'),
        join(root, 'missing.txt'),
        join(root, 'src', 'nested.ts')
      ])
    )
  })
})

type GitSource = {
  commit: string
  pullRef: string
  releaseCommit: string
  source: string
  tag: string
}

async function createGitSource(): Promise<GitSource> {
  const source = await tempDir('git-kit-source-')
  await $`git init -b main`.cwd(source).quiet()
  await writeFile(join(source, 'README.md'), 'main\n')
  await $`git add README.md`.cwd(source).quiet()
  await $`git -c user.email=git-kit@example.com -c user.name=GitKit commit -m main`.cwd(source).quiet()
  const commit = await $`git rev-parse HEAD`
    .cwd(source)
    .quiet()
    .text()
    .then(text => text.trim())
  const tag = 'v1.0.0'
  const pullRef = 'pull/1/head'
  await $`git tag ${tag}`.cwd(source).quiet()
  await $`git update-ref ${`refs/${pullRef}`} ${commit}`.cwd(source).quiet()
  await $`git checkout -b release`.cwd(source).quiet()
  await writeFile(join(source, 'README.md'), 'release\n')
  await $`git add README.md`.cwd(source).quiet()
  await $`git -c user.email=git-kit@example.com -c user.name=GitKit commit -m release`.cwd(source).quiet()
  const releaseCommit = await $`git rev-parse HEAD`
    .cwd(source)
    .quiet()
    .text()
    .then(text => text.trim())
  await $`git checkout main`.cwd(source).quiet()
  return { commit, pullRef, releaseCommit, source, tag }
}

async function createEmptyGitWorktree(): Promise<string> {
  const source = await tempDir('git-kit-source-')
  await $`git init -b main`.cwd(source).quiet()
  return source
}

async function tempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirs.add(directory)
  return directory
}

async function checkoutTempDirs(): Promise<string[]> {
  const entries = await readdir(tmpdir(), { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('git-kit-checkout-'))
    .map(entry => join(tmpdir(), entry.name))
    .sort()
}
