import { describe, expect, test } from 'bun:test'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'zx'

import { Checkout } from '../src/checkout.js'
import { tempDir } from './helpers/fs.js'

describe('checkout planning', () => {
  test('cleans temporary git checkouts after use', async () => {
    const source = await createGitSource()
    let checkoutDir = ''

    await Checkout.withAll([{ ref: 'main', source }], async checkouts => {
      checkoutDir = checkouts.values().next().value?.dir ?? ''
    })

    await expect(stat(checkoutDir)).rejects.toThrow()
  })

  test('cleans temporary git checkouts when checkout preparation fails', async () => {
    const source = await createGitSource()
    const before = await checkoutTempDirs()

    await expect(Checkout.withAll([{ ref: 'missing', source }], async () => undefined)).rejects.toThrow()

    expect(await checkoutTempDirs()).toEqual(before)
  })
})

async function createGitSource(): Promise<string> {
  const repo = await tempDir('skills-checkout-source-')
  await $({ cwd: repo, quiet: true })`git init -b main`
  await writeFile(join(repo, 'README.md'), 'fixture\n')
  await $({ cwd: repo, quiet: true })`git add README.md`
  await $({ cwd: repo, quiet: true })`git -c user.email=skills@example.com -c user.name=Skills commit -m init`
  return `file://${repo}`
}

async function checkoutTempDirs(): Promise<string[]> {
  const entries = await readdir(tmpdir(), { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith('skills-checkout-'))
    .map(entry => entry.name)
    .sort()
}
