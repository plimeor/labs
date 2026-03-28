# lark-auth-cli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `lark-auth-cli` package that obtains a Lark/Feishu `user_access_token` via OAuth2 authorization code flow, usable as both CLI and programmatic API.

**Architecture:** OAuth core logic in `oauth.ts` handles the full flow (local HTTP server, browser open, token exchange). `index.ts` wraps it as the public API. `cli.ts` wires it to incur. Types live in `types.ts`.

**Tech Stack:** Bun runtime, incur (CLI framework), Zod (via incur), Bun.serve() for local HTTP server.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/lark-auth-cli/package.json` | Package manifest, bin entry, dependencies |
| `packages/lark-auth-cli/tsconfig.json` | TypeScript config extending root |
| `packages/lark-auth-cli/src/types.ts` | `GetUserTokenOptions` and `TokenResult` types |
| `packages/lark-auth-cli/src/oauth.ts` | OAuth flow: build URL, start server, exchange tokens |
| `packages/lark-auth-cli/src/index.ts` | Public API: `getUserToken()` function |
| `packages/lark-auth-cli/src/cli.ts` | incur CLI: `lark-auth get-user-token` command |
| `packages/lark-auth-cli/tests/oauth.test.ts` | Tests for OAuth logic |

---

### Task 1: Scaffold package

**Files:**
- Create: `packages/lark-auth-cli/package.json`
- Create: `packages/lark-auth-cli/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "lark-auth-cli",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "bin": {
    "lark-auth": "./src/cli.ts"
  },
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "incur": "^0.3.13"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd /Users/plimeor/Documents/labs && bun install`
Expected: lockfile updates, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/lark-auth-cli/package.json packages/lark-auth-cli/tsconfig.json bun.lock
git commit -m "feat(lark-auth-cli): scaffold package"
```

---

### Task 2: Define types

**Files:**
- Create: `packages/lark-auth-cli/src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
export interface GetUserTokenOptions {
  appId?: string
  appSecret?: string
  port?: number
  save?: string
}

export interface TokenResult {
  access_token: string
  expires_in: number
  refresh_expires_in: number
  refresh_token: string
}

export interface LarkApiResponse<T> {
  code: number
  data: T
  msg: string
}

export interface AppAccessTokenData {
  app_access_token: string
  expire: number
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/lark-auth-cli/src/types.ts
git commit -m "feat(lark-auth-cli): add type definitions"
```

---

### Task 3: Implement OAuth core — token exchange helpers

**Files:**
- Create: `packages/lark-auth-cli/src/oauth.ts`
- Create: `packages/lark-auth-cli/tests/oauth.test.ts`

- [ ] **Step 1: Write failing test for `getAppAccessToken`**

```typescript
import { describe, expect, it, mock } from 'bun:test'

import { getAppAccessToken } from '../src/oauth'

describe('getAppAccessToken', () => {
  it('returns app_access_token on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            data: { app_access_token: 'at-test-123', expire: 7200 }
          })
        )
      )
    ) as any

    const result = await getAppAccessToken('app-id', 'app-secret')
    expect(result).toBe('at-test-123')

    globalThis.fetch = originalFetch
  })

  it('throws on Lark API error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: 10003,
            msg: 'app_id invalid',
            data: {}
          })
        )
      )
    ) as any

    expect(getAppAccessToken('bad-id', 'secret')).rejects.toThrow('app_id invalid')

    globalThis.fetch = originalFetch
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/plimeor/Documents/labs && bun test packages/lark-auth-cli/tests/oauth.test.ts`
Expected: FAIL — `getAppAccessToken` not found.

- [ ] **Step 3: Implement `getAppAccessToken` and `exchangeCodeForToken` in oauth.ts**

```typescript
import type { AppAccessTokenData, LarkApiResponse, TokenResult } from './types'

const LARK_BASE = 'https://open.feishu.cn/open-apis'

export async function getAppAccessToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch(`${LARK_BASE}/auth/v3/app_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  })
  const json = (await res.json()) as LarkApiResponse<AppAccessTokenData>
  if (json.code !== 0) throw new Error(`Lark API error: ${json.msg}`)
  return json.data.app_access_token
}

export async function exchangeCodeForToken(appAccessToken: string, code: string): Promise<TokenResult> {
  const res = await fetch(`${LARK_BASE}/authen/v1/oidc/access_token`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${appAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code })
  })
  const json = (await res.json()) as LarkApiResponse<TokenResult>
  if (json.code !== 0) throw new Error(`Lark API error: ${json.msg}`)
  return json.data
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/plimeor/Documents/labs && bun test packages/lark-auth-cli/tests/oauth.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 5: Write failing test for `exchangeCodeForToken`**

Add to `tests/oauth.test.ts`:

```typescript
import { exchangeCodeForToken } from '../src/oauth'

describe('exchangeCodeForToken', () => {
  it('returns token result on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: 0,
            msg: 'ok',
            data: {
              access_token: 'u-test-token',
              refresh_token: 'ur-test-refresh',
              expires_in: 6900,
              refresh_expires_in: 2592000
            }
          })
        )
      )
    ) as any

    const result = await exchangeCodeForToken('at-123', 'code-456')
    expect(result.access_token).toBe('u-test-token')
    expect(result.refresh_token).toBe('ur-test-refresh')

    globalThis.fetch = originalFetch
  })
})
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `cd /Users/plimeor/Documents/labs && bun test packages/lark-auth-cli/tests/oauth.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/lark-auth-cli/src/oauth.ts packages/lark-auth-cli/tests/oauth.test.ts
git commit -m "feat(lark-auth-cli): implement token exchange helpers with tests"
```

---

### Task 4: Implement OAuth core — full flow with local server

**Files:**
- Modify: `packages/lark-auth-cli/src/oauth.ts`

- [ ] **Step 1: Add `buildAuthUrl` function to oauth.ts**

Append to `oauth.ts`:

```typescript
export function buildAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state
  })
  return `${LARK_BASE}/authen/v1/authorize?${params}`
}
```

- [ ] **Step 2: Add `startOAuthFlow` function to oauth.ts**

Append to `oauth.ts`:

```typescript
const SUCCESS_HTML = `<!DOCTYPE html><html><body><h1>Authorization successful</h1><p>You can close this tab.</p></body></html>`
const ERROR_HTML = (msg: string) =>
  `<!DOCTYPE html><html><body><h1>Authorization failed</h1><p>${msg}</p></body></html>`

export async function startOAuthFlow(options: {
  appId: string
  appSecret: string
  port: number
}): Promise<TokenResult> {
  const { appId, appSecret, port } = options
  const state = crypto.randomUUID()
  const redirectUri = `http://localhost:${port}/callback`
  const authUrl = buildAuthUrl(appId, redirectUri, state)

  const { promise, resolve, reject } = Promise.withResolvers<string>()

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url)
      if (url.pathname !== '/callback') {
        return new Response('Not found', { status: 404 })
      }

      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')

      if (returnedState !== state) {
        reject(new Error('State mismatch — possible CSRF attack'))
        return new Response(ERROR_HTML('State mismatch'), { status: 400, headers: { 'Content-Type': 'text/html' } })
      }

      if (!code) {
        reject(new Error('No authorization code received'))
        return new Response(ERROR_HTML('No code received'), { status: 400, headers: { 'Content-Type': 'text/html' } })
      }

      resolve(code)
      return new Response(SUCCESS_HTML, { headers: { 'Content-Type': 'text/html' } })
    }
  })

  // Open browser
  const proc = Bun.spawn(['open', authUrl], { stdout: 'ignore', stderr: 'ignore' })
  await proc.exited

  try {
    const code = await promise
    const appAccessToken = await getAppAccessToken(appId, appSecret)
    return await exchangeCodeForToken(appAccessToken, code)
  } finally {
    server.stop()
  }
}
```

- [ ] **Step 3: Run type check**

Run: `cd /Users/plimeor/Documents/labs && bunx --bun tsgo --noEmit --project packages/lark-auth-cli/tsconfig.json`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/lark-auth-cli/src/oauth.ts
git commit -m "feat(lark-auth-cli): implement full OAuth flow with local server"
```

---

### Task 5: Implement programmatic API

**Files:**
- Create: `packages/lark-auth-cli/src/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
import { writeFile } from 'node:fs/promises'

import { startOAuthFlow } from './oauth'
import type { GetUserTokenOptions, TokenResult } from './types'

export type { GetUserTokenOptions, TokenResult } from './types'

const DEFAULT_PORT = 19823

export async function getUserToken(options: GetUserTokenOptions = {}): Promise<TokenResult> {
  const appId = options.appId ?? process.env.LARK_APP_ID
  const appSecret = options.appSecret ?? process.env.LARK_APP_SECRET

  if (!appId) throw new Error('LARK_APP_ID is required (pass appId option or set env)')
  if (!appSecret) throw new Error('LARK_APP_SECRET is required (pass appSecret option or set env)')

  const port = options.port ?? DEFAULT_PORT
  const result = await startOAuthFlow({ appId, appSecret, port })

  if (options.save) {
    await writeFile(options.save, JSON.stringify(result, null, 2))
  }

  return result
}
```

- [ ] **Step 2: Run type check**

Run: `cd /Users/plimeor/Documents/labs && bunx --bun tsgo --noEmit --project packages/lark-auth-cli/tsconfig.json`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/lark-auth-cli/src/index.ts
git commit -m "feat(lark-auth-cli): add programmatic API entry"
```

---

### Task 6: Implement CLI with incur

**Files:**
- Create: `packages/lark-auth-cli/src/cli.ts`

- [ ] **Step 1: Write cli.ts**

```typescript
import { Cli, z } from 'incur'

import { getUserToken } from './index'

Cli.create('lark-auth', { description: 'Lark/Feishu authentication tools' })
  .command('get-user-token', {
    description: 'Obtain a user_access_token via OAuth2 authorization code flow',
    env: z.object({
      LARK_APP_ID: z.string().describe('Lark app ID'),
      LARK_APP_SECRET: z.string().describe('Lark app secret')
    }),
    options: z.object({
      port: z.coerce.number().default(19823).describe('Local callback server port'),
      save: z.boolean().optional().describe('Save token to .lark-token.json')
    }),
    async run(c) {
      const result = await getUserToken({
        appId: c.env.LARK_APP_ID,
        appSecret: c.env.LARK_APP_SECRET,
        port: c.options.port,
        save: c.options.save ? '.lark-token.json' : undefined
      })
      return result
    }
  })
  .serve()
```

- [ ] **Step 2: Verify CLI help works**

Run: `cd /Users/plimeor/Documents/labs && bun packages/lark-auth-cli/src/cli.ts --help`
Expected: Shows help text with `get-user-token` command listed.

- [ ] **Step 3: Commit**

```bash
git add packages/lark-auth-cli/src/cli.ts
git commit -m "feat(lark-auth-cli): add incur CLI entry"
```

---

### Task 7: Lint and final check

**Files:**
- Modify: any files that need formatting fixes

- [ ] **Step 1: Run biome check**

Run: `cd /Users/plimeor/Documents/labs && bunx biome check --write packages/lark-auth-cli/`
Expected: All files pass or auto-fixed.

- [ ] **Step 2: Run type check**

Run: `cd /Users/plimeor/Documents/labs && bunx --bun tsgo --noEmit --project packages/lark-auth-cli/tsconfig.json`
Expected: No errors.

- [ ] **Step 3: Run tests**

Run: `cd /Users/plimeor/Documents/labs && bun test packages/lark-auth-cli/tests/`
Expected: All tests pass.

- [ ] **Step 4: Commit any formatting fixes**

```bash
git add packages/lark-auth-cli/
git commit -m "chore(lark-auth-cli): lint and format"
```
