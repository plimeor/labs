import { basename } from 'node:path'

import { $ } from 'zx'

import { Files } from './files.js'

export type GitIdentity = {
  branch: string
  commit: string
  repoUrl?: string
  root: string
}

export type NormalizedGitRemote = {
  ref?: string
  repoUrl: string
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
  await $({
    cwd: repoPath,
    quiet: true
  })`git fetch --prune --tags origin +refs/heads/*:refs/remotes/origin/* +refs/tags/*:refs/tags/*`
  await $({ cwd: repoPath, quiet: true })`git remote set-head origin -a`.nothrow()
}

export async function checkoutProjectRef(
  repoPath: string,
  ref: string
): Promise<{ branch: string; commit: string; ref: string }> {
  const latest = await resolveProjectRef(repoPath, ref)
  await $({ cwd: repoPath, quiet: true })`git checkout --detach ${latest.commit}`

  return latest
}

export async function resolveProjectRef(
  repoPath: string,
  ref: string
): Promise<{ branch: string; commit: string; ref: string }> {
  if (ref === 'HEAD') {
    const commit = await gitOutput(repoPath, ['rev-parse', 'origin/HEAD'])
    const branch = await remoteHeadBranch(repoPath)
    return { branch, commit, ref }
  }

  const candidates = [
    { branch: ref, revision: `refs/remotes/origin/${ref}` },
    { branch: ref, revision: `origin/${ref}` },
    { branch: ref, revision: `refs/tags/${ref}` },
    { branch: ref, revision: ref }
  ]

  for (const candidate of candidates) {
    const commit = await optionalGitOutput(repoPath, ['rev-parse', '--verify', `${candidate.revision}^{commit}`])
    if (commit) {
      return {
        branch: candidate.branch,
        commit,
        ref
      }
    }
  }

  throw new Error(`Unable to resolve project ref ${ref}`)
}

async function remoteHeadBranch(repoPath: string): Promise<string> {
  const branchRef = await optionalGitOutput(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  return branchRef?.replace(/^origin\//, '') ?? 'HEAD'
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

export function normalizeGitRemote(input: string): NormalizedGitRemote {
  const trimmed = input.trim()
  const github = parseGithubTreeUrl(trimmed)
  if (github) {
    return github
  }

  return { repoUrl: trimmed }
}

function parseGithubTreeUrl(input: string): NormalizedGitRemote | undefined {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return undefined
  }

  if (url.hostname !== 'github.com') {
    return undefined
  }

  const [owner, repoWithSuffix, marker, ...refParts] = url.pathname.split('/').filter(Boolean)
  if (!owner || !repoWithSuffix) {
    return undefined
  }

  const repo = repoWithSuffix.replace(/\.git$/, '')
  const repoUrl = `https://github.com/${owner}/${repo}.git`
  if ((marker === 'tree' || marker === 'blob') && refParts.length > 0) {
    return {
      ref: refParts.join('/'),
      repoUrl
    }
  }

  if (url.protocol === 'https:') {
    return { repoUrl }
  }

  return undefined
}
