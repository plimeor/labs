// Integration test: spawns a real `anchor serve` on an ephemeral port and
// verifies createHttpAnchorBackend() against an isolated temp vault.
//
// GATED: only runs when ANCHOR_HTTP_IT=1 is set.
// Plain `bun test src` does NOT need a built binary and skips this file entirely.
//
// Run it with:
//   ANCHOR_HTTP_IT=1 bun test src/backend/__tests__/http-integration.test.ts
//
// Requires the Rust CLI binary to be built first:
//   cargo build -p anchor-core --bin anchor-cli

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

if (process.env.ANCHOR_HTTP_IT !== '1') {
  // Graceful skip — bun:test has no native skip, so we emit a notice and export nothing.
  console.log('[http-integration] Skipped (set ANCHOR_HTTP_IT=1 to enable).')
} else {
  runIntegrationSuite()
}

function runIntegrationSuite() {
  const { resolve } = require('node:path') as typeof import('node:path')
  const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
  const { tmpdir } = require('node:os') as typeof import('node:os')

  // Cargo workspace root for the anchor suite (suites/anchor), where the
  // shared target/ dir lives.
  const cargoRoot = resolve(import.meta.dir, '../../../..')
  // Path to the built Rust CLI binary (debug build)
  const anchorCoreBin = resolve(cargoRoot, 'target/debug/anchor-cli')

  let serverProc: ReturnType<typeof Bun.spawn> | undefined
  let baseUrl: string
  let vaultDir: string

  beforeAll(async () => {
    // Create a fresh temp vault for isolation
    vaultDir = mkdtempSync(`${tmpdir()}/anchor-http-it-`)

    // Find a free port: use 0 binding trick via a temp TCP listener
    const port = await findFreePort()
    baseUrl = `http://127.0.0.1:${port}`

    // Initialize the vault structure before starting the server
    const init = Bun.spawnSync([anchorCoreBin, 'vault', 'open', vaultDir])
    if (init.exitCode !== 0) {
      throw new Error(`anchor-core vault open failed:\n${new TextDecoder().decode(init.stderr)}`)
    }

    // Start the server
    serverProc = Bun.spawn([anchorCoreBin, '--vault', vaultDir, 'serve', '--http', `127.0.0.1:${port}`], {
      stderr: 'pipe',
      stdout: 'pipe'
    })

    // Wait for the server to be ready (poll /diagnostics)
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      try {
        const resp = await fetch(`${baseUrl}/diagnostics`)
        if (resp.ok) break
      } catch {}
      await Bun.sleep(100)
    }
  })

  afterAll(() => {
    try {
      serverProc?.kill()
    } catch {}
  })

  describe('HTTP AnchorBackend contract suite', () => {
    // Import the module dynamically so VITE_ANCHOR_CORE_URL can be set first.
    // We override the BASE constant by setting the env variable before import.
    // Since import.meta.env is Vite-specific and not available in Bun test,
    // we patch the module's base URL via a workaround: set VITE_ANCHOR_CORE_URL
    // as a plain env var and check it in the module.

    test('diagnostics returns health:ok after vault open', async () => {
      process.env.VITE_ANCHOR_CORE_URL = baseUrl
      const { createHttpAnchorBackend } = await import('../http-operation-core')
      const backend = createHttpAnchorBackend()

      const diag = await backend.diagnostics()
      expect(diag.health).toBe('ok')
    })

    test('createNote then readNote round-trip over HTTP', async () => {
      process.env.VITE_ANCHOR_CORE_URL = baseUrl
      const { createHttpAnchorBackend } = await import('../http-operation-core')
      const backend = createHttpAnchorBackend()

      const created = await backend.createNote({ body: '# Integration\n\nTest body.', title: 'HTTP Integration Test' })
      const read = await backend.readNote(created.metadata.id)
      expect(read.metadata.id).toBe(created.metadata.id)
      expect(read.metadata.title).toBe('HTTP Integration Test')
      expect(read.body).toBe('# Integration\n\nTest body.')
    })

    test('updateNote conflict detection over HTTP', async () => {
      process.env.VITE_ANCHOR_CORE_URL = baseUrl
      const { createHttpAnchorBackend } = await import('../http-operation-core')
      const backend = createHttpAnchorBackend()

      const note = await backend.createNote({ title: 'Conflict HTTP Test' })
      const updated = await backend.updateNote({
        baseRevision: note.revision,
        body: '# Updated once.',
        noteId: note.metadata.id
      })
      expect(updated.revision).not.toBe(note.revision)

      await expect(
        backend.updateNote({
          baseRevision: note.revision,
          body: '# Stale.',
          noteId: note.metadata.id
        })
      ).rejects.toThrow('conflict')
    })
  })
}

async function findFreePort(): Promise<number> {
  // Use Bun's net module to find a free port by letting the OS assign one
  const server = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: { close() {}, data() {}, error() {}, open() {} }
  })
  const port = server.port
  server.stop()
  return port
}
