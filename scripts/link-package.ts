import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'zx'

const PACKAGE_SCOPE = '@plimeor/'

type PackageJson = {
  name?: string
  workspaces?: string[] | { packages?: string[] }
}

type WorkspacePackage = {
  dir: string
  name: string
}

class UsageError extends Error {}

async function main() {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const targetPackageName = normalizeTargetPackageName(process.argv.slice(2))
  const workspacePackage = await findWorkspacePackage(rootDir, targetPackageName)

  if (!workspacePackage) {
    throw new UsageError(`Workspace package not found: ${targetPackageName}`)
  }

  await $({ cwd: rootDir, stdio: 'inherit' })`bun install --filter ${workspacePackage.name}`
  await $({ cwd: rootDir, stdio: 'inherit' })`bun run --filter ${workspacePackage.name} build`
  await $({ cwd: workspacePackage.dir, stdio: 'inherit' })`bun link`
}

function normalizeTargetPackageName(args: string[]): string {
  if (args.length !== 1) {
    throw new UsageError(`Usage: bun run link-package <package>

Examples:
  bun run link-package skills
  bun run link-package @plimeor/skills`)
  }

  const input = args[0]?.trim()

  if (!input) {
    throw new UsageError('Package name must not be empty.')
  }

  if (input.startsWith('@')) {
    const unscopedName = input.slice(PACKAGE_SCOPE.length)

    if (!input.startsWith(PACKAGE_SCOPE) || !unscopedName || unscopedName.includes('/')) {
      throw new UsageError(`Expected an unscoped package name or ${PACKAGE_SCOPE}<name>.`)
    }

    return input
  }

  if (input.includes('/')) {
    throw new UsageError(`Expected an unscoped package name or ${PACKAGE_SCOPE}<name>.`)
  }

  return `${PACKAGE_SCOPE}${input}`
}

async function findWorkspacePackage(rootDir: string, packageName: string): Promise<WorkspacePackage | undefined> {
  const rootPackageJson = await readPackageJson(join(rootDir, 'package.json'))
  const workspacePatterns = getWorkspacePatterns(rootPackageJson)

  for (const pattern of workspacePatterns) {
    const packageDirs = await expandWorkspacePattern(rootDir, pattern)

    for (const dir of packageDirs) {
      const packageJson = await readPackageJson(join(dir, 'package.json')).catch(() => undefined)

      if (packageJson?.name === packageName) {
        return { dir, name: packageJson.name }
      }
    }
  }

  return undefined
}

function getWorkspacePatterns(packageJson: PackageJson): string[] {
  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces
  }

  return packageJson.workspaces?.packages ?? []
}

async function expandWorkspacePattern(rootDir: string, pattern: string): Promise<string[]> {
  if (!pattern.includes('*')) {
    return [resolve(rootDir, pattern)]
  }

  if (!pattern.endsWith('/*') || pattern.slice(0, -2).includes('*')) {
    throw new UsageError(`Unsupported workspace pattern: ${pattern}`)
  }

  const baseDir = resolve(rootDir, pattern.slice(0, -2))
  const entries = await readdir(baseDir, { withFileTypes: true }).catch(() => [])

  return entries.filter(entry => entry.isDirectory()).map(entry => join(baseDir, entry.name))
}

async function readPackageJson(path: string): Promise<PackageJson> {
  return JSON.parse(await readFile(path, 'utf-8')) as PackageJson
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
