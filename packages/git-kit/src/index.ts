import { mkdtemp, readdir, readFile, stat as readStat, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { $ } from 'bun'

export type CheckoutRequest = {
  directory?: string
  ref?: string
  reuseExisting?: boolean
  source: string
}

export type RepositoryCheckoutOptions = Omit<CheckoutRequest, 'source'>

export type CheckoutSnapshot = {
  currentRef: string
  directory: string
  headSha: string
  identity: string
  source?: string
}

export type ResolvedRef = {
  headSha: string
  ref: string
}

export type SwitchRequest = {
  detach?: boolean
  ref: string
}

export class Repository {
  readonly identity: string
  readonly source: string

  constructor(source: string) {
    this.source = normalizeSource(source)
    this.identity = identityFromSource(this.source)
  }

  async checkout(options: RepositoryCheckoutOptions = {}): Promise<Checkout> {
    const temporaryRoot = options.directory ? undefined : await mkdtemp(join(tmpdir(), 'git-kit-checkout-'))
    const directory = options.directory ?? join(temporaryRoot as string, 'repo')

    try {
      if (options.reuseExisting && (await isGitRepository(directory))) {
        return await reuseExistingWorktree({
          directory,
          ref: options.ref,
          source: this.source,
          temporaryRoot
        })
      }

      await $`git clone ${this.source} ${directory}`.quiet()
      const checkout = await createCheckout(directory, { temporaryRoot })

      if (options.ref) {
        await checkout.switch({ ref: options.ref })
      }

      return checkout
    } catch (error) {
      if (temporaryRoot) {
        await rm(temporaryRoot, { force: true, recursive: true })
      }
      throw error
    }
  }
}

export class Checkout {
  #snapshot: CheckoutSnapshot
  #temporaryRoot?: string

  constructor(snapshot: CheckoutSnapshot, options: { temporaryRoot?: string } = {}) {
    this.#snapshot = snapshot
    this.#temporaryRoot = options.temporaryRoot
  }

  get currentRef(): string {
    return this.#snapshot.currentRef
  }

  get directory(): string {
    return this.#snapshot.directory
  }

  get headSha(): string {
    return this.#snapshot.headSha
  }

  get identity(): string {
    return this.#snapshot.identity
  }

  get source(): string | undefined {
    return this.#snapshot.source
  }

  snapshot(): CheckoutSnapshot {
    return { ...this.#snapshot }
  }

  async refresh(): Promise<CheckoutSnapshot> {
    this.#snapshot = await inspectWorktree(this.directory)
    return this.snapshot()
  }

  async fetch(ref = 'HEAD'): Promise<ResolvedRef> {
    if (ref === 'HEAD') {
      const resolvedRef = await remoteDefaultRef(this.directory)
      const headSha = await fetchRemoteBranch(this.directory, resolvedRef)
      if (!headSha) {
        throw new Error(`Unable to fetch remote branch: ${resolvedRef}`)
      }
      return { headSha, ref: resolvedRef }
    }

    const branchSha = await fetchRemoteBranch(this.directory, ref)
    if (branchSha) {
      return { headSha: branchSha, ref }
    }

    const tagSha = await fetchRemoteTag(this.directory, ref)
    if (tagSha) {
      return { headSha: tagSha, ref }
    }

    try {
      await $`git fetch origin ${ref}`.cwd(this.directory).quiet()
      const headSha = await resolveCommit(this.directory, 'FETCH_HEAD^{commit}')
      return { headSha, ref }
    } catch {
      await $`git fetch origin ${'+refs/heads/*:refs/remotes/origin/*'} ${'+refs/tags/*:refs/tags/*'}`
        .cwd(this.directory)
        .quiet()
    }

    const headSha = await resolveCommit(this.directory, `${ref}^{commit}`)
    return { headSha, ref }
  }

  async switch(request: SwitchRequest): Promise<ResolvedRef> {
    if (request.detach) {
      await $`git checkout --detach ${request.ref}`.cwd(this.directory).quiet()
    } else {
      await $`git checkout ${request.ref}`.cwd(this.directory).quiet()
    }

    await this.refresh()
    return { headSha: this.headSha, ref: this.currentRef }
  }

  async listWorktreeFiles(): Promise<string[]> {
    const output = await $`git ls-files -co --exclude-standard -z`.cwd(this.directory).quiet().text()
    return output
      .split('\0')
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  }

  async collectIgnorePaths(input = this.directory): Promise<Set<string>> {
    const resolvedInput = resolve(input)
    const realInput = await realpath(resolvedInput)
    const ignoreFiles = await walkIgnoreFiles(this.directory, realInput)
    const rules = new Set<string>()

    for (const ignoreFile of ignoreFiles) {
      const base = dirname(ignoreFile)
      const content = await readFile(ignoreFile, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const rule = normalizeIgnoreRule(line)
        if (rule) {
          rules.add(resolve(resolvedInput, relative(realInput, resolve(base, rule))))
        }
      }
    }

    return rules
  }

  async dispose(): Promise<void> {
    if (!this.#temporaryRoot) {
      return
    }

    const temporaryRoot = this.#temporaryRoot
    this.#temporaryRoot = undefined
    await rm(temporaryRoot, { force: true, recursive: true })
  }
}

export function repository(source: string): Repository {
  return new Repository(source)
}

export async function checkout(request: CheckoutRequest): Promise<Checkout> {
  return repository(request.source).checkout({
    directory: request.directory,
    ref: request.ref,
    reuseExisting: request.reuseExisting
  })
}

export async function withCheckout<T>(
  request: CheckoutRequest,
  callback: (checkout: Checkout) => Promise<T>
): Promise<T> {
  const worktree = await checkout(request)
  try {
    return await callback(worktree)
  } finally {
    await worktree.dispose()
  }
}

export async function openWorktree(directory: string): Promise<Checkout> {
  return createCheckout(directory)
}

async function createCheckout(directory: string, options: { temporaryRoot?: string } = {}): Promise<Checkout> {
  return new Checkout(await inspectWorktree(directory), options)
}

async function inspectWorktree(directory: string): Promise<CheckoutSnapshot> {
  const root = await worktreeRoot(directory)
  const [headSha, refName, remoteOutput] = await Promise.all([
    currentHead(root),
    currentRef(root),
    $`git remote -v`.cwd(root).quiet().text()
  ])
  const source = parseOriginRemote(remoteOutput)

  return {
    currentRef: refName,
    directory: root,
    headSha,
    identity: source ? identityFromSource(source) : identityFromPath(root),
    ...(source ? { source } : {})
  }
}

async function worktreeRoot(directory: string): Promise<string> {
  const root = await $`git rev-parse --show-toplevel`.cwd(directory).quiet().text().then(trimText)
  return realpath(root)
}

function normalizeSource(input: string): string {
  const source = input.trim()
  if (!source) {
    throw new Error('Git source must not be empty')
  }

  if (isLocalPath(source)) {
    throw new Error(`Local paths are not supported as Git sources: ${input}`)
  }

  const shorthand = source.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/)
  if (shorthand) {
    return `https://github.com/${shorthand[1]}/${shorthand[2].replace(/\.git$/, '')}.git`
  }

  return source
}

function isLocalPath(input: string): boolean {
  return isAbsolute(input) || input === '.' || input === '..' || input.startsWith('./') || input.startsWith('../')
}

async function isGitRepository(directory: string): Promise<boolean> {
  try {
    const gitMetadata = await readStat(join(directory, '.git'))
    return gitMetadata.isDirectory() || gitMetadata.isFile()
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function currentRef(directory: string): Promise<string> {
  const ref = await $`git rev-parse --abbrev-ref HEAD`
    .cwd(directory)
    .quiet()
    .text()
    .then(trimText)
    .catch(() => 'HEAD')
  return ref && ref !== 'HEAD' ? ref : 'HEAD'
}

async function currentHead(directory: string): Promise<string> {
  try {
    return await resolveCommit(directory, 'HEAD')
  } catch {
    return 'HEAD'
  }
}

async function remoteDefaultRef(directory: string): Promise<string> {
  const output = await $`git ls-remote --symref origin HEAD`.cwd(directory).quiet().text()
  const match = output.match(/^ref: refs\/heads\/(.+)\s+HEAD/m)
  if (!match?.[1]) {
    throw new Error('Unable to resolve remote HEAD')
  }
  return match[1]
}

async function fetchRemoteBranch(directory: string, ref: string): Promise<string | undefined> {
  try {
    await $`git fetch origin ${`+refs/heads/${ref}:refs/remotes/origin/${ref}`}`.cwd(directory).quiet()
  } catch {
    return undefined
  }

  return resolveCommit(directory, `refs/remotes/origin/${ref}^{commit}`)
}

async function fetchRemoteTag(directory: string, ref: string): Promise<string | undefined> {
  try {
    await $`git fetch origin tag ${ref}`.cwd(directory).quiet()
  } catch {
    return undefined
  }

  return resolveCommit(directory, `refs/tags/${ref}^{commit}`)
}

async function resolveCommit(directory: string, ref: string): Promise<string> {
  return $`git rev-parse --verify ${ref}`.cwd(directory).quiet().text().then(trimText)
}

function parseOriginRemote(output: string): string | undefined {
  for (const line of output.split('\n')) {
    const match = line.match(/^origin\s+(\S+)\s+\(fetch\)$/)
    if (match?.[1]) {
      return match[1]
    }
  }
}

function identityFromSource(source: string): string {
  const normalizedSource = source.replace(/\.git$/, '')
  const parts = normalizedSource.split(/[/:]/).filter(Boolean)
  const repoName = parts.at(-1) ?? basename(normalizedSource)
  const owner = parts.at(-2)
  return owner ? slugify(`${owner}__${repoName}`) : slugify(repoName)
}

function identityFromPath(path: string): string {
  const parent = basename(dirname(path))
  const name = basename(path)
  return parent ? slugify(`${parent}__${name}`) : slugify(name)
}

async function reuseExistingWorktree(options: {
  directory: string
  ref?: string
  source: string
  temporaryRoot?: string
}): Promise<Checkout> {
  const worktree = await createCheckout(options.directory, { temporaryRoot: options.temporaryRoot })
  if (worktree.source !== options.source) {
    throw new Error(`Existing checkout origin does not match requested source: ${worktree.source ?? 'none'}`)
  }

  const expected = await worktree.fetch(options.ref ?? 'HEAD')
  await worktree.switch({ ref: expected.ref })
  if (worktree.headSha !== expected.headSha) {
    throw new Error(`Existing checkout did not resolve requested ref: ${expected.ref}`)
  }

  return worktree
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

function slugify(input: string): string {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return value || 'root'
}

function toPosixPath(path: string): string {
  return path.split(/[\\/]+/).join('/')
}

function trimText(input: string): string {
  return input.trim()
}
