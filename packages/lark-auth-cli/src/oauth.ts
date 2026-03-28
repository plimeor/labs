import type { AppAccessTokenData, LarkApiResponse, TokenResult } from './types'

const LARK_BASE = 'https://open.feishu.cn/open-apis'

export async function getAppAccessToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch(`${LARK_BASE}/auth/v3/app_access_token/internal`, {
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST'
  })
  const json = (await res.json()) as LarkApiResponse<AppAccessTokenData>
  if (json.code !== 0) throw new Error(`Lark API error: ${json.msg}`)
  return json.data.app_access_token
}

export async function exchangeCodeForToken(appAccessToken: string, code: string): Promise<TokenResult> {
  const res = await fetch(`${LARK_BASE}/authen/v1/oidc/access_token`, {
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appAccessToken}`,
      'Content-Type': 'application/json'
    }
  })
  const json = (await res.json()) as LarkApiResponse<TokenResult>
  if (json.code !== 0) throw new Error(`Lark API error: ${json.msg}`)
  return json.data
}

export function buildAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state
  })
  return `${LARK_BASE}/authen/v1/authorize?${params}`
}

const SUCCESS_HTML =
  '<!DOCTYPE html><html><body><h1>Authorization successful</h1><p>You can close this tab.</p></body></html>'
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
        return new Response(ERROR_HTML('State mismatch'), {
          headers: { 'Content-Type': 'text/html' },
          status: 400
        })
      }

      if (!code) {
        reject(new Error('No authorization code received'))
        return new Response(ERROR_HTML('No code received'), {
          headers: { 'Content-Type': 'text/html' },
          status: 400
        })
      }

      resolve(code)
      return new Response(SUCCESS_HTML, {
        headers: { 'Content-Type': 'text/html' }
      })
    }
  })

  const proc = Bun.spawn(['open', authUrl], {
    stderr: 'ignore',
    stdout: 'ignore'
  })
  await proc.exited

  try {
    const code = await promise
    const appAccessToken = await getAppAccessToken(appId, appSecret)
    return await exchangeCodeForToken(appAccessToken, code)
  } finally {
    server.stop()
  }
}
