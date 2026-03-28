import { homedir } from 'node:os'
import { join, sep } from 'node:path'

import type { Manifest } from './manifest.js'

export type Scope = {
  createGlobalDir: boolean
  globalDir: string
  installDir: string
  lockPath: string
  manifestPath: string
  scope: Manifest.Scope
}

export function resolveScope(global = false): Scope {
  const cwd = process.cwd()
  const home = process.env.HOME ?? homedir()
  const scope: Manifest.Scope = global ? 'global' : 'project'
  const globalDir = join(home, '.agents')
  const stateDir = scope === 'global' ? globalDir : join(cwd, '.agents')

  return {
    createGlobalDir: scope === 'global',
    globalDir,
    installDir: join(stateDir, 'skills'),
    lockPath: join(stateDir, 'skills.lock.json'),
    manifestPath: join(stateDir, 'skills.json'),
    scope
  }
}

export function formatDisplayPath(path: string): string {
  const home = process.env.HOME ?? homedir()
  if (path === home) {
    return '~'
  }

  return path.startsWith(`${home}${sep}`) ? `~${path.slice(home.length)}` : path
}
