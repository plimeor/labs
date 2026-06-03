import { resolve } from 'node:path'

const WEB_ROOT = resolve(import.meta.dir, '..')
const DEV_ORIGIN = 'http://127.0.0.1:1420'
const TEST_TIMEOUT_MS = '60000'
const target = process.argv[2] ?? 'editor-webview'

async function main() {
  const serverAlreadyRunning = await isDevServerReady()
  const server = serverAlreadyRunning
    ? undefined
    : Bun.spawn(['bun', 'node_modules/.bin/vite', '--host', '127.0.0.1'], {
        cwd: WEB_ROOT,
        stderr: 'inherit',
        stdout: 'inherit'
      })

  try {
    if (!serverAlreadyRunning) {
      await waitForDevServer()
    }

    const test = Bun.spawn(['bun', 'test', 'e2e/editor.e2e.test.ts', '--timeout', TEST_TIMEOUT_MS], {
      cwd: WEB_ROOT,
      stderr: 'inherit',
      stdout: 'inherit',
      env: {
        ...process.env,
        ANCHOR_E2E_BASE_URL: DEV_ORIGIN,
        ANCHOR_E2E_TARGET: target,
        ANCHOR_E2E_WEBVIEW: '1'
      }
    })
    const exitCode = await test.exited
    process.exitCode = exitCode
  } finally {
    server?.kill()
    await server?.exited.catch(() => {})
  }
}

async function isDevServerReady(): Promise<boolean> {
  try {
    const response = await fetch(DEV_ORIGIN, { signal: AbortSignal.timeout(1000) })
    return response.ok
  } catch {
    return false
  }
}

async function waitForDevServer() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await isDevServerReady()) {
      return
    }
    await Bun.sleep(200)
  }
  throw new Error(`Vite dev server did not become ready at ${DEV_ORIGIN}`)
}

await main()
