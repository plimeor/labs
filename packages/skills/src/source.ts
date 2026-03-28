import { isAbsolute, resolve } from 'node:path'

export type ResolvedSource =
  | {
      input: string
      localPath: string
      type: 'local'
    }
  | {
      gitUrl: string
      input: string
      type: 'git'
    }

export function resolveSource(input: string): ResolvedSource {
  const source = input.trim()
  if (!source) {
    throw new Error('Source must not be empty')
  }

  if (isLocalPath(source)) {
    return {
      input: source,
      localPath: resolve(process.cwd(), source),
      type: 'local'
    }
  }

  return {
    gitUrl: normalizeGitSource(source),
    input: source,
    type: 'git'
  }
}

function normalizeGitSource(source: string): string {
  if (source.startsWith('github:')) {
    return normalizeGitHubShorthand(source.slice('github:'.length))
  }

  if (source.startsWith('git@') || source.startsWith('http://') || source.startsWith('https://')) {
    return source
  }

  const shorthand = source.match(/^([^/]+)\/([^/]+)$/)
  if (shorthand) {
    return normalizeGitHubShorthand(source)
  }

  return source
}

function normalizeGitHubShorthand(source: string): string {
  const [owner, repo] = source.split('/')
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub source: ${source}`)
  }

  return `https://github.com/${owner}/${repo.replace(/\.git$/, '')}.git`
}

function isLocalPath(input: string): boolean {
  return isAbsolute(input) || input === '.' || input === '..' || input.startsWith('./') || input.startsWith('../')
}
