import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { $ } from 'bun'

import {
  findPackagesWithVersionChanges,
  listWorkspacePackages,
  orderByWorkspaceDependencies,
  validateDependentVersionBumps,
  type WorkspacePackage
} from './package-version-bumps.ts'

class PublishError extends Error {}

async function main() {
  const rootDir = process.cwd()
  const before = getRequiredEnv('PUBLISH_BEFORE')
  const current = process.env.PUBLISH_CURRENT || 'HEAD'
  const packages = await listWorkspacePackages(rootDir)
  const changedPackages = await findPackagesWithVersionChanges(packages, before, current)
  validateDependentVersionBumps(packages, changedPackages)

  if (changedPackages.length === 0) {
    console.log('No package version changes found.')
    return
  }

  const publishOrder = orderByWorkspaceDependencies(packages, changedPackages)
  const packageSummary = publishOrder.map(pkg => `${pkg.name}@${pkg.version}`).join(', ')
  console.log(`Packages selected for publish: ${packageSummary}`)

  const packDir = await createPackDir(rootDir)

  for (const pkg of publishOrder) {
    await publishPackage(pkg, packDir)
  }
}

async function publishPackage(pkg: WorkspacePackage, packDir: string) {
  if (await packageVersionExists(pkg)) {
    console.log(`Skipping ${pkg.name}@${pkg.version}: version already exists on npm.`)
    return
  }

  const tarballPath = join(packDir, tarballFileName(pkg))

  await $`bun pm pack --destination ${packDir} --filename ${tarballFileName(pkg)}`.cwd(pkg.dir)
  await $`npm publish ${tarballPath}`.cwd(pkg.dir)
}

async function packageVersionExists(pkg: WorkspacePackage): Promise<boolean> {
  const output = await $`npm view ${`${pkg.name}@${pkg.version}`} version --json`.quiet().nothrow()

  if (output.exitCode === 0) {
    return true
  }

  const text = `${output.stdout.toString()}\n${output.stderr.toString()}`

  if (text.includes('E404')) {
    return false
  }

  throw new PublishError(`Unable to check npm version for ${pkg.name}@${pkg.version}.\n${text}`)
}

async function createPackDir(rootDir: string): Promise<string> {
  const baseDir = process.env.RUNNER_TEMP ? resolve(process.env.RUNNER_TEMP) : join(rootDir, '.tmp')
  const packDir = join(baseDir, 'npm-publish')

  await mkdir(packDir, { recursive: true })

  return packDir
}

function tarballFileName(pkg: WorkspacePackage): string {
  return `${pkg.name.replace(/^@/, '').replaceAll('/', '-')}-${pkg.version}.tgz`
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new PublishError(`${name} is required.`)
  }

  return value
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
