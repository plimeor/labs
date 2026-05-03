import { mkdtemp, readdir, readFile, stat as readStat, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { $ } from 'bun'

export type StatResult = {
  HEAD: string
  identity: string
  path: string
  ref: string
  repo?: string
}

export type CloneOptions = {
  path?: string
  ref?: string
  repo: string
  skipExisting?: boolean
}

export type CloneResult = StatResult & {
  dispose?: () => Promise<void>
}

export type FetchOptions = {
  path: string
  ref: string
}

export type FetchResult = {
  HEAD: string
  ref: string
}

export type SwitchOptions = {
  detach?: boolean
  path: string
  ref: string
}

export type SwitchResult = {
  HEAD: string
  ref: string
}

export function identity(input: string): string {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return value || 'root'
}

export async function stat(path: string): Promise<StatResult> {
  const root = await $`git rev-parse --show-toplevel`.cwd(path).quiet().text().then(trimText)
  const [HEAD, ref, remoteOutput] = await Promise.all([
    currentHEAD(path),
    currentRef(path),
    $`git remote -v`.cwd(path).quiet().text()
  ])
  const repo = parseOriginRemote(remoteOutput)

  return {
    HEAD,
    identity: repo ? remoteIdentity(repo) : pathIdentity(root),
    path: root,
    ref,
    ...(repo ? { repo } : {})
  }
}

export async function clone(options: CloneOptions): Promise<CloneResult> {
  const repo = normalizeRepo(options.repo)
  const temporaryRoot = options.path ? undefined : await mkdtemp(join(tmpdir(), 'git-kit-clone-'))
  const path = options.path ?? join(temporaryRoot as string, 'repo')

  try {
    if (options.skipExisting && (await isGitRepository(path))) {
      await reuseExistingCheckout({ path, ref: options.ref, repo })
    } else {
      await $`git clone ${repo} ${path}`.quiet()

      if (options.ref) {
        await switchTo({ path, ref: options.ref })
      }
    }

    const result = await stat(path)
    return {
      ...result,
      dispose: temporaryRoot ? () => rm(path, { force: true, recursive: true }) : undefined
    }
  } catch (error) {
    if (temporaryRoot) {
      await rm(path, { force: true, recursive: true })
    }
    throw error
  }
}

export async function fetch(options: FetchOptions): Promise<FetchResult> {
  await $`git fetch origin`.cwd(options.path).quiet()

  if (options.ref === 'HEAD') {
    const ref = await remoteDefaultRef(options.path)
    const HEAD = await $`git rev-parse ${`refs/remotes/origin/${ref}^{commit}`}`
      .cwd(options.path)
      .quiet()
      .text()
      .then(trimText)
    return { HEAD, ref }
  }

  if (await remoteBranchExists(options.path, options.ref)) {
    await $`git fetch origin ${`+refs/heads/${options.ref}:refs/remotes/origin/${options.ref}`}`
      .cwd(options.path)
      .quiet()
    const HEAD = await $`git rev-parse ${`refs/remotes/origin/${options.ref}^{commit}`}`
      .cwd(options.path)
      .quiet()
      .text()
      .then(trimText)
    return { HEAD, ref: options.ref }
  }

  if (await remoteTagExists(options.path, options.ref)) {
    await $`git fetch origin tag ${options.ref}`.cwd(options.path).quiet()
    const HEAD = await $`git rev-parse ${`refs/tags/${options.ref}^{commit}`}`
      .cwd(options.path)
      .quiet()
      .text()
      .then(trimText)
    return { HEAD, ref: options.ref }
  }

  try {
    await $`git fetch origin ${options.ref}`.cwd(options.path).quiet()
    const HEAD = await $`git rev-parse ${'FETCH_HEAD^{commit}'}`.cwd(options.path).quiet().text().then(trimText)
    return { HEAD, ref: options.ref }
  } catch {
    await $`git fetch origin ${'+refs/heads/*:refs/remotes/origin/*'} ${'+refs/tags/*:refs/tags/*'}`
      .cwd(options.path)
      .quiet()
  }
  const HEAD = await $`git rev-parse ${`${options.ref}^{commit}`}`.cwd(options.path).quiet().text().then(trimText)
  return { HEAD, ref: options.ref }
}

export async function listFiles(path: string): Promise<string[]> {
  const root = (await stat(path)).path
  const output = await $`git ls-files -co --exclude-standard -z`.cwd(root).quiet().text()
  return output
    .split('\0')
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

async function switchTo(options: SwitchOptions): Promise<SwitchResult> {
  if (options.detach) {
    await $`git checkout --detach ${options.ref}`.cwd(options.path).quiet()
  } else {
    await $`git checkout ${options.ref}`.cwd(options.path).quiet()
  }
  const result = await stat(options.path)
  return { HEAD: result.HEAD, ref: result.ref }
}

export { switchTo as switch }

export async function collectIgnorePaths(path: string): Promise<Set<string>> {
  const input = resolve(path)
  const realInput = await realpath(input)
  const root = (await stat(realInput)).path
  const ignoreFiles = await walkIgnoreFiles(root, realInput)
  const rules = new Set<string>()
  for (const ignoreFile of ignoreFiles) {
    const base = dirname(ignoreFile)
    const content = await readFile(ignoreFile, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const rule = normalizeIgnoreRule(line)
      if (rule) {
        rules.add(resolve(input, relative(realInput, resolve(base, rule))))
      }
    }
  }

  return rules
}

function normalizeRepo(input: string): string {
  const repo = input
  if (!repo) {
    throw new Error('Git repo must not be empty')
  }

  if (isLocalPath(repo)) {
    throw new Error(`Local paths are not supported as Git repos: ${input}`)
  }

  const shorthand = repo.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (shorthand) {
    return `https://github.com/${shorthand[1]}/${shorthand[2].replace(/\.git$/, '')}.git`
  }

  return repo
}

function isLocalPath(input: string): boolean {
  return isAbsolute(input) || input === '.' || input === '..' || input.startsWith('./') || input.startsWith('../')
}

async function isGitRepository(path: string): Promise<boolean> {
  try {
    const gitMetadata = await readStat(join(path, '.git'))
    return gitMetadata.isDirectory() || gitMetadata.isFile()
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function currentRef(path: string): Promise<string> {
  const ref = await $`git rev-parse --abbrev-ref HEAD`
    .cwd(path)
    .quiet()
    .text()
    .then(trimText)
    .catch(() => 'HEAD')
  return ref && ref !== 'HEAD' ? ref : 'HEAD'
}

async function currentHEAD(path: string): Promise<string> {
  try {
    return await $`git rev-parse --verify HEAD`.cwd(path).quiet().text().then(trimText)
  } catch {
    return 'HEAD'
  }
}

async function remoteDefaultRef(path: string): Promise<string> {
  const output = await $`git ls-remote --symref origin HEAD`.cwd(path).quiet().text()
  const match = output.match(/^ref: refs\/heads\/(.+)\s+HEAD/m)
  if (!match?.[1]) {
    throw new Error('Unable to resolve remote HEAD')
  }
  return match[1]
}

async function remoteBranchExists(path: string, ref: string): Promise<boolean> {
  const output = await $`git ls-remote --heads origin ${ref}`.cwd(path).quiet().text().then(trimText)
  return Boolean(output)
}

async function remoteTagExists(path: string, ref: string): Promise<boolean> {
  const output = await $`git ls-remote --tags origin ${ref}`.cwd(path).quiet().text().then(trimText)
  return Boolean(output)
}

function parseOriginRemote(output: string): string | undefined {
  for (const line of output.split('\n')) {
    const match = line.match(/^origin\s+(\S+)\s+\(fetch\)$/)
    if (match?.[1]) {
      return match[1]
    }
  }
}

function remoteIdentity(repo: string): string {
  const source = repo.replace(/\.git$/, '')
  const parts = source.split(/[/:]/).filter(Boolean)
  const repoName = parts.at(-1) ?? basename(source)
  const owner = parts.at(-2)
  return owner ? identity(`${owner}__${repoName}`) : identity(repoName)
}

function pathIdentity(path: string): string {
  const parent = basename(dirname(path))
  const name = basename(path)
  return parent ? identity(`${parent}__${name}`) : identity(name)
}

async function reuseExistingCheckout(options: { path: string; ref?: string; repo: string }): Promise<void> {
  const result = await stat(options.path)
  if (result.repo !== options.repo) {
    throw new Error(`Existing checkout origin does not match requested repo: ${result.repo ?? 'none'}`)
  }

  const expected = await fetch({ path: options.path, ref: options.ref ?? 'HEAD' })
  await switchTo({ path: options.path, ref: expected.ref })
  const current = await stat(options.path)
  if (current.HEAD !== expected.HEAD) {
    throw new Error(`Existing checkout did not resolve requested ref: ${expected.ref}`)
  }
}

async function walkIgnoreFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current)
  const paths: string[] = []
  for (const entry of entries) {
    const path = join(current, entry)
    if (toPosixPath(relative(root, path)) === '.git') {
      continue
    }

    const stats = await readStat(path)
    if (stats.isDirectory()) {
      paths.push(...(await walkIgnoreFiles(root, path)))
      continue
    }

    if (stats.isFile() && entry === '.gitignore') {
      paths.push(path)
    }
  }

  return paths
}

function normalizeIgnoreRule(input: string): string | undefined {
  const rule = input
  if (!rule || rule.startsWith('#') || rule.startsWith('!')) {
    return undefined
  }

  const normalized = rule.replace(/^\/+/, '').replace(/\/+$/, '')

  return normalized || undefined
}

function toPosixPath(path: string): string {
  return path.split(/[\\/]+/).join('/')
}

function trimText(input: string): string {
  return input.trim()
}
