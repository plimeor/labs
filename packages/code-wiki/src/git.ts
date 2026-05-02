import { basename } from 'node:path'

import { $ } from 'zx'

import { Files } from './files.js'

export type GitIdentity = {
  branch: string
  commit: string
  repoUrl?: string
  root: string
}

export async function requireGitRoot(cwd: string): Promise<string> {
  return gitOutput(cwd, ['rev-parse', '--show-toplevel'])
}

export async function readGitIdentity(cwd: string): Promise<GitIdentity> {
  const root = await requireGitRoot(cwd)
  const [commit, branch, repoUrl] = await Promise.all([
    gitOutput(root, ['rev-parse', 'HEAD']),
    currentBranch(root),
    optionalGitOutput(root, ['config', '--get', 'remote.origin.url'])
  ])

  return {
    branch,
    commit,
    repoUrl,
    root
  }
}

export async function inferProjectIdFromRoot(root: string): Promise<string> {
  const remoteUrl = await optionalGitOutput(root, ['config', '--get', 'remote.origin.url'])
  const source = remoteUrl
    ? remoteUrl
        .replace(/\.git$/, '')
        .split(/[/:]/)
        .at(-1)
    : basename(root)
  return slugProjectId(source ?? basename(root))
}

export async function ensureManagedClone(repoUrl: string, repoPath: string): Promise<void> {
  const gitDir = `${repoPath}/.git`
  if (!(await Files.pathExists(gitDir))) {
    if (await Files.pathExists(repoPath)) {
      throw new Error(`Managed repo path exists but is not a Git clone: ${repoPath}`)
    }

    await $({ quiet: true })`git clone --no-checkout ${repoUrl} ${repoPath}`
  }

  await $({ cwd: repoPath, quiet: true })`git remote set-url origin ${repoUrl}`
  await $({ cwd: repoPath, quiet: true })`git fetch --prune origin`
  await $({ cwd: repoPath, quiet: true })`git remote set-head origin -a`.nothrow()
}

export async function checkoutRemoteHead(repoPath: string): Promise<{ branch: string; commit: string }> {
  const commit = await gitOutput(repoPath, ['rev-parse', 'origin/HEAD'])
  const branchRef = await optionalGitOutput(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  const branch = branchRef?.replace(/^origin\//, '') ?? 'HEAD'
  await $({ cwd: repoPath, quiet: true })`git checkout --detach ${commit}`

  return { branch, commit }
}

export async function latestRemoteHead(repoPath: string): Promise<{ branch: string; commit: string }> {
  const commit = await gitOutput(repoPath, ['rev-parse', 'origin/HEAD'])
  const branchRef = await optionalGitOutput(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  return {
    branch: branchRef?.replace(/^origin\//, '') ?? 'HEAD',
    commit
  }
}

async function currentBranch(root: string): Promise<string> {
  const branch = await optionalGitOutput(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return branch && branch !== 'HEAD' ? branch : 'HEAD'
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  const output = await $({ cwd, quiet: true })`git ${args}`
  return output.stdout.trim()
}

async function optionalGitOutput(cwd: string, args: string[]): Promise<string | undefined> {
  const output = await $({ cwd, quiet: true })`git ${args}`.nothrow()
  const value = output.stdout.trim()
  return output.exitCode === 0 && value ? value : undefined
}

function slugProjectId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
