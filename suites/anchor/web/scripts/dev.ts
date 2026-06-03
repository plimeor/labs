#!/usr/bin/env bun
/**
 * Dev runner: spawns `anchor-core serve` (Axum HTTP bridge) and `vite` together.
 *
 * Usage: bun run dev   (invoked via package.json "dev" script)
 *
 * What it does:
 *   1. Starts `cargo run --bin anchor-core -- serve --vault <demo-vault> --http 127.0.0.1:4317`
 *      from the src-tauri directory. The Rust server loads the vault once and
 *      holds it in memory; the web UI's "Reload demo vault" button calls
 *      open_demo_vault which re-seeds it if needed.
 *   2. Starts `vite --host 127.0.0.1` (the web dev server on port 1420).
 *      Vite proxies /anchor-core/* → http://127.0.0.1:4317/* so the browser
 *      talks to the core over the same origin, no CORS needed.
 *   3. Forwards stdout/stderr from both processes with a [core] / [vite] prefix.
 *   4. Kills both when either exits or when Ctrl-C is received.
 *
 * No new dependencies: uses Bun's built-in Bun.spawn.
 */

import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const repoRoot = resolve(root, '..')

// Demo vault — the serve command opens it at startup. The committed Markdown is
// the source of truth; the .anchor/ projection is regenerated on load (git-ignored),
// so the vault works on a fresh checkout with no extra init step.
const demoVault = resolve(root, '../desktop/demo/vault')

function prefix(tag: string, data: Uint8Array) {
  const lines = new TextDecoder().decode(data).split('\n')
  for (const line of lines) {
    if (line.trim()) process.stderr.write(`[${tag}] ${line}\n`)
  }
}

// Spawn anchor-core serve
const core = Bun.spawn(
  [
    'cargo',
    'run',
    '-p',
    'anchor-core',
    '--bin',
    'anchor-cli',
    '--',
    'serve',
    '--vault',
    demoVault,
    '--http',
    '127.0.0.1:4317'
  ],
  {
    cwd: repoRoot,
    env: { ...process.env },
    stderr: 'pipe',
    stdout: 'pipe'
  }
)

// Spawn vite
const vite = Bun.spawn(['bunx', 'vite', '--host', '127.0.0.1'], {
  cwd: root,
  env: { ...process.env },
  stderr: 'pipe',
  stdout: 'pipe'
})

// Stream output with prefixes
async function stream(proc: ReturnType<typeof Bun.spawn>, tag: string) {
  if (proc.stdout instanceof ReadableStream) {
    const reader = proc.stdout.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value
      prefix(tag, chunk)
    }
  }
}

async function streamErr(proc: ReturnType<typeof Bun.spawn>, tag: string) {
  if (proc.stderr instanceof ReadableStream) {
    const reader = proc.stderr.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value
      prefix(tag, chunk)
    }
  }
}

stream(core, 'core')
streamErr(core, 'core')
stream(vite, 'vite')
streamErr(vite, 'vite')

// Kill both on exit / Ctrl-C
function cleanup() {
  try {
    core.kill()
  } catch {}
  try {
    vite.kill()
  } catch {}
}

process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})
process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

// Wait for either to exit and then clean up
await Promise.race([core.exited, vite.exited])
cleanup()
