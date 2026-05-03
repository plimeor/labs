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

export async function stat(path: string): Promise<StatResult> {
  const root = await $`printf "%s" "$(git rev-parse --show-toplevel)"`.cwd(path).quiet().text()
  const [HEAD, ref, remoteOutput] = await Promise.all([
    $`printf "%s" "$(git rev-parse --verify HEAD 2> /dev/null || printf HEAD)"`.cwd(root).quiet().text(),
    currentRef(root),
    $`git remote -v`.cwd(root).quiet().text()
  ])
  const repo = parseOriginRemote(remoteOutput)

  return {
    HEAD,
    identity: repo ? remoteIdentity(repo) : basename(root),
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
      await $`git remote set-url origin ${repo}`.cwd(path).quiet()
    } else {
      await $`git clone ${repo} ${path}`.quiet()
    }

    if (options.ref) {
      await switchTo({ path, ref: options.ref })
    }

    const result = await stat(path)
    return {
      ...result,
      dispose: temporaryRoot ? () => rm(temporaryRoot, { force: true, recursive: true }) : undefined
    }
  } catch (error) {
    if (temporaryRoot) {
      await rm(temporaryRoot, { force: true, recursive: true })
    }
    throw error
  }
}

export async function fetch(options: FetchOptions): Promise<FetchResult> {
  await $`git fetch origin`.cwd(options.path).quiet()

  if (options.ref === 'HEAD') {
    const ref = await remoteDefaultRef(options.path)
    const HEAD = await $`printf "%s" "$(git rev-parse ${`refs/remotes/origin/${ref}^{commit}`})"`
      .cwd(options.path)
      .quiet()
      .text()
    return { HEAD, ref }
  }

  if (await remoteBranchExists(options.path, options.ref)) {
    await $`git fetch origin ${`+refs/heads/${options.ref}:refs/remotes/origin/${options.ref}`}`
      .cwd(options.path)
      .quiet()
    const HEAD = await $`printf "%s" "$(git rev-parse ${`refs/remotes/origin/${options.ref}^{commit}`})"`
      .cwd(options.path)
      .quiet()
      .text()
    return { HEAD, ref: options.ref }
  }

  if (await remoteTagExists(options.path, options.ref)) {
    await $`git fetch origin ${`+refs/tags/${options.ref}:refs/tags/${options.ref}`}`.cwd(options.path).quiet()
    const HEAD = await $`printf "%s" "$(git rev-parse ${`refs/tags/${options.ref}^{commit}`})"`
      .cwd(options.path)
      .quiet()
      .text()
    return { HEAD, ref: options.ref }
  }

  try {
    await $`git fetch origin ${options.ref}`.cwd(options.path).quiet()
  } catch {
    await $`git fetch origin ${'+refs/heads/*:refs/remotes/origin/*'} ${'+refs/tags/*:refs/tags/*'}`
      .cwd(options.path)
      .quiet()
  }
  const HEAD = await $`printf "%s" "$(git rev-parse ${`${options.ref}^{commit}`})"`.cwd(options.path).quiet().text()
  return { HEAD, ref: options.ref }
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

export async function collectIgnoreRules(path: string): Promise<Set<string>> {
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
  const ref = await $`printf "%s" "$(git symbolic-ref --short HEAD 2> /dev/null || git rev-parse --abbrev-ref HEAD)"`
    .cwd(path)
    .quiet()
    .text()
  return ref && ref !== 'HEAD' ? ref : 'HEAD'
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
  const output = await $`git ls-remote --heads origin ${ref}`.cwd(path).quiet().text()
  return Boolean(output)
}

async function remoteTagExists(path: string, ref: string): Promise<boolean> {
  const output = await $`git ls-remote --tags origin ${ref}`.cwd(path).quiet().text()
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
  return source.split(/[/:]/).filter(Boolean).at(-1) ?? basename(source)
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
