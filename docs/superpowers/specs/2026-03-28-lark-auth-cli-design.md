# lark-auth-cli Design Spec

## Overview

A Bun package in the monorepo that obtains a Lark/Feishu `user_access_token` via the standard OAuth2 authorization code flow. Exposes both a CLI (via incur) and a programmatic API for composability with other tools.

## Package Structure

```
packages/lark-auth-cli/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts      # Programmatic API entry: export { getUserToken }
    ├── cli.ts         # incur CLI entry: lark-auth get-user-token
    ├── oauth.ts       # OAuth core logic (build URL, local server, token exchange)
    └── types.ts       # Type definitions
```

## Programmatic API

```typescript
export interface GetUserTokenOptions {
  appId?: string       // defaults to process.env.LARK_APP_ID
  appSecret?: string   // defaults to process.env.LARK_APP_SECRET
  port?: number        // defaults to 19823
  save?: string        // file path to write token JSON
}

export interface TokenResult {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_expires_in: number
}

export async function getUserToken(options?: GetUserTokenOptions): Promise<TokenResult>
```

## CLI

Built with incur. Single command `get-user-token` under the `lark-auth` binary.

```bash
lark-auth get-user-token            # prints token JSON to stdout
lark-auth get-user-token --save     # also writes to .lark-token.json
```

Options:
- `--save` (boolean, optional): Write token to `.lark-token.json` in cwd
- `--port` (number, optional): Override callback port (default 19823)

Environment variables:
- `LARK_APP_ID` (required)
- `LARK_APP_SECRET` (required)

## OAuth Flow

1. Read `appId` and `appSecret` from options or env
2. Generate random `state` string (crypto.randomUUID)
3. Build authorization URL:
   ```
   https://open.feishu.cn/open-apis/authen/v1/authorize
     ?app_id={appId}
     &redirect_uri=http://localhost:19823/callback
     &state={state}
   ```
4. Start local HTTP server on `localhost:{port}` using `Bun.serve()`
5. Open browser via `Bun.openurl()` (falls back to platform `open` command)
6. Wait for callback at `/callback?code={code}&state={state}`
7. Validate `state` matches
8. Exchange credentials:
   - POST `https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal` with `{app_id, app_secret}` to get `app_access_token`
   - POST `https://open.feishu.cn/open-apis/authen/v1/oidc/access_token` with `Authorization: Bearer {app_access_token}` and `{grant_type: "authorization_code", code}` to get `user_access_token`
9. Stop server, return `TokenResult`
10. CLI layer: print JSON to stdout; if `--save`, write to `.lark-token.json`

## Callback Response

When the browser hits `/callback`, the server responds with a minimal HTML page confirming success, then closes. On error (state mismatch, missing code), respond with an error page and reject the promise.

## Dependencies

- `incur` — CLI framework
- No other external deps. HTTP server via `Bun.serve()`, HTTP client via global `fetch`.

## Error Handling

- Missing `LARK_APP_ID` or `LARK_APP_SECRET`: throw immediately with clear message
- State mismatch on callback: reject with error, respond 400 to browser
- Lark API errors (non-zero code in response): throw with Lark's error message
- Timeout: no explicit timeout in v1 (server waits indefinitely for user to authorize)

## Redirect URI Configuration

Users must add `http://localhost:19823/callback` to their Lark app's "Security Settings > Redirect URLs" in the developer console.
