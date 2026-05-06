import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { $ } from 'bun'

import {
  collectPackagesAffectedByVersionBump,
  listWorkspacePackages,
  orderByWorkspaceDependencies,
  type WorkspacePackage
} from './package-version-bumps'

class BumpVersionError extends Error {}

async function main() {
  const rootDir = process.cwd()
  const targetName = normalizeArgs(process.argv.slice(2))
  const packages = await listWorkspacePackages(rootDir)
  const targetPackage = resolveTargetPackage(packages, targetName)
  const affectedPackages = collectPackagesAffectedByVersionBump(packages, [targetPackage])
  const bumpOrder = orderByWorkspaceDependencies(packages, affectedPackages)

  for (const pkg of bumpOrder) {
    await bumpPackageVersion(pkg)
  }

  await regenerateLockfile(rootDir)

  console.log(
    `Bumped package versions: ${bumpOrder.map(pkg => `${pkg.name}@${nextPatchVersion(pkg.version)}`).join(', ')}`
  )
}

function normalizeArgs(args: string[]): string {
  if (args.length !== 1) {
    throw new BumpVersionError(`Usage: bun run bump-version <package>

Examples:
  bun run bump-version skills
  bun run bump-version @plimeor/skills`)
  }

  const packageName = args[0]?.trim()

  if (!packageName) {
    throw new BumpVersionError('Package name must not be empty.')
  }

  return packageName
}

function resolveTargetPackage(packages: WorkspacePackage[], input: string): WorkspacePackage {
  const candidates = packages.filter(pkg => pkg.name === input || pkg.name.endsWith(`/${input}`))

  if (candidates.length === 1) {
    return candidates[0] as WorkspacePackage
  }

  if (candidates.length > 1) {
    throw new BumpVersionError(`Package name is ambiguous: ${input}`)
  }

  throw new BumpVersionError(`Workspace package not found: ${input}`)
}

async function bumpPackageVersion(pkg: WorkspacePackage) {
  const path = join(pkg.dir, 'package.json')
  const packageJson = await Bun.file(path).json()

  packageJson.version = nextPatchVersion(pkg.version)

  await writeFile(path, `${JSON.stringify(packageJson, null, 2)}\n`)
}

async function regenerateLockfile(rootDir: string) {
  await rm(join(rootDir, 'bun.lock'), { force: true })
  await $`bun install`.cwd(rootDir)
}

function nextPatchVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)

  if (!match) {
    throw new BumpVersionError(`Only x.y.z versions are supported: ${version}`)
  }

  const major = match[1]
  const minor = match[2]
  const patch = Number(match[3]) + 1

  return `${major}.${minor}.${patch}`
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
