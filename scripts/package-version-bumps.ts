import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { $ } from 'bun'

export type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  name?: string
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  private?: boolean
  version?: string
}

export type WorkspacePackage = {
  dir: string
  manifestPath: string
  name: string
  packageJson: PackageJson
  version: string
}

export class PackageVersionBumpError extends Error {}

const ZERO_SHA = /^0+$/

export async function listWorkspacePackages(rootDir: string): Promise<WorkspacePackage[]> {
  const packagesDir = join(rootDir, 'packages')
  const entries = await readdir(packagesDir, { withFileTypes: true })
  const packages: WorkspacePackage[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const dir = join(packagesDir, entry.name)
    const manifestPath = join(dir, 'package.json')
    const packageJson = await Bun.file(manifestPath)
      .json()
      .catch(() => undefined)

    if (!isPublishablePackageJson(packageJson)) {
      continue
    }

    packages.push({
      dir,
      manifestPath: relative(rootDir, manifestPath),
      name: packageJson.name,
      packageJson,
      version: packageJson.version
    })
  }

  return packages.sort((a, b) => a.manifestPath.localeCompare(b.manifestPath))
}

export async function findPackagesWithVersionChanges(
  packages: WorkspacePackage[],
  before: string,
  current: string
): Promise<WorkspacePackage[]> {
  const changedPackages: WorkspacePackage[] = []

  for (const pkg of packages) {
    const previous = await readPackageJsonAtRef(before, pkg.manifestPath)
    const next = await readPackageJsonAtRef(current, pkg.manifestPath)

    if (!next) {
      continue
    }

    if (previous?.version !== next.version) {
      changedPackages.push(pkg)
    }
  }

  return changedPackages
}

export function orderByWorkspaceDependencies(
  packages: WorkspacePackage[],
  changedPackages: WorkspacePackage[]
): WorkspacePackage[] {
  const packageByName = new Map(packages.map(pkg => [pkg.name, pkg]))
  const changedNames = new Set(changedPackages.map(pkg => pkg.name))
  const ordered: WorkspacePackage[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()

  function visit(pkg: WorkspacePackage) {
    if (visited.has(pkg.name)) {
      return
    }

    if (visiting.has(pkg.name)) {
      throw new PackageVersionBumpError(`Workspace dependency cycle includes ${pkg.name}.`)
    }

    visiting.add(pkg.name)

    for (const dependencyName of workspaceDependencyNames(pkg.packageJson)) {
      const dependency = packageByName.get(dependencyName)

      if (dependency && changedNames.has(dependency.name)) {
        visit(dependency)
      }
    }

    visiting.delete(pkg.name)
    visited.add(pkg.name)
    ordered.push(pkg)
  }

  for (const pkg of changedPackages) {
    visit(pkg)
  }

  return ordered
}

export function validateDependentVersionBumps(packages: WorkspacePackage[], changedPackages: WorkspacePackage[]) {
  const changedNames = new Set(changedPackages.map(pkg => pkg.name))
  const { requiredNames, reasons } = collectDependentClosure(packages, changedNames)
  const missingBumps = [...requiredNames].filter(name => !changedNames.has(name))

  if (missingBumps.length === 0) {
    return
  }

  const details = missingBumps
    .sort()
    .map(name => {
      const dependencies = [...(reasons.get(name) ?? [])].sort().join(', ')
      return `- ${name} depends on changed package(s): ${dependencies}`
    })
    .join('\n')

  throw new PackageVersionBumpError(`Dependent packages must bump their own versions before publishing:\n${details}`)
}

export function collectPackagesAffectedByVersionBump(
  packages: WorkspacePackage[],
  rootPackages: WorkspacePackage[]
): WorkspacePackage[] {
  const rootNames = new Set(rootPackages.map(pkg => pkg.name))
  const { requiredNames } = collectDependentClosure(packages, rootNames)

  return packages.filter(pkg => requiredNames.has(pkg.name))
}

async function readPackageJsonAtRef(ref: string, path: string): Promise<PackageJson | undefined> {
  if (ZERO_SHA.test(ref)) {
    return undefined
  }

  const spec = `${ref}:${path}`
  const output = await $`git show ${spec}`.quiet().nothrow()

  if (output.exitCode !== 0) {
    return undefined
  }

  return JSON.parse(output.stdout.toString()) as PackageJson
}

export function workspaceDependencyNames(packageJson: PackageJson): string[] {
  return [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {})
  ]
}

function collectDependentClosure(
  packages: WorkspacePackage[],
  rootNames: Set<string>
): { reasons: Map<string, Set<string>>; requiredNames: Set<string> } {
  const requiredNames = new Set(rootNames)
  const reasons = new Map<string, Set<string>>()
  let changed = true

  while (changed) {
    changed = false

    for (const pkg of packages) {
      if (requiredNames.has(pkg.name)) {
        continue
      }

      const changedDependencies = workspaceDependencyNames(pkg.packageJson).filter(name => requiredNames.has(name))

      if (changedDependencies.length === 0) {
        continue
      }

      requiredNames.add(pkg.name)
      reasons.set(pkg.name, new Set(changedDependencies))
      changed = true
    }
  }

  return { reasons, requiredNames }
}

function isPublishablePackageJson(value: unknown): value is PackageJson & { name: string; version: string } {
  if (!value || typeof value !== 'object') {
    return false
  }

  const packageJson = value as PackageJson

  return packageJson.private !== true && typeof packageJson.name === 'string' && typeof packageJson.version === 'string'
}
