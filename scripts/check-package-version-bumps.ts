import { $ } from 'bun'

import {
  findPackagesWithVersionChanges,
  listWorkspacePackages,
  validateDependentVersionBumps
} from './package-version-bumps'

class CheckError extends Error {}

async function main() {
  const rootDir = process.cwd()
  const before = process.env.PACKAGE_VERSION_BUMP_BASE ?? (await defaultBaseRef())
  const current = process.env.PACKAGE_VERSION_BUMP_HEAD ?? 'HEAD'
  const packages = await listWorkspacePackages(rootDir)
  const changedPackages = await findPackagesWithVersionChanges(packages, before, current)

  validateDependentVersionBumps(packages, changedPackages)

  if (changedPackages.length === 0) {
    console.log(`No package version changes found between ${before} and ${current}.`)
    return
  }

  console.log(
    `Package version bump check passed: ${changedPackages.map(pkg => `${pkg.name}@${pkg.version}`).join(', ')}`
  )
}

async function defaultBaseRef(): Promise<string> {
  const originMain = await $`git rev-parse --verify origin/main`.quiet().nothrow()

  if (originMain.exitCode === 0) {
    return originMain.stdout.toString().trim()
  }

  const parent = await $`git rev-parse --verify HEAD^`.quiet().nothrow()

  if (parent.exitCode === 0) {
    return parent.stdout.toString().trim()
  }

  throw new CheckError('PACKAGE_VERSION_BUMP_BASE is required when origin/main and HEAD^ are unavailable.')
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
