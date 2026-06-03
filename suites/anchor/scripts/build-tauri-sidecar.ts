#!/usr/bin/env bun

import { chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const srcTauri = resolve(repoRoot, 'desktop/src-tauri')
const binariesDir = resolve(srcTauri, 'binaries')

const rustc = Bun.spawnSync(['rustc', '-vV'], { cwd: repoRoot })
if (rustc.exitCode !== 0) {
  process.stderr.write(new TextDecoder().decode(rustc.stderr))
  process.exit(rustc.exitCode)
}

const rustcOutput = new TextDecoder().decode(rustc.stdout)
const host = rustcOutput
  .split('\n')
  .find(line => line.startsWith('host: '))
  ?.slice('host: '.length)
  .trim()

if (!host) {
  process.stderr.write('failed to detect rust target triple from rustc -vV\n')
  process.exit(1)
}

const build = Bun.spawnSync(['cargo', 'build', '-p', 'anchor-core', '--bin', 'anchor-cli', '--release'], {
  cwd: repoRoot,
  stderr: 'inherit',
  stdout: 'inherit'
})

if (build.exitCode !== 0) {
  process.exit(build.exitCode)
}

mkdirSync(binariesDir, { recursive: true })

const source = resolve(repoRoot, 'target/release/anchor-cli')
const target = resolve(binariesDir, `anchor-cli-${host}`)
copyFileSync(source, target)
chmodSync(target, 0o755)

console.log(`Prepared Tauri sidecar: ${target}`)
