import { describe, expect, it, mock } from 'bun:test'

import { exchangeCodeForToken, getAppAccessToken } from '../src/oauth'

describe('getAppAccessToken', () => {
  it('returns app_access_token on success', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: 0,
            data: { app_access_token: 'at-test-123', expire: 7200 },
            msg: 'ok'
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
            data: {},
            msg: 'app_id invalid'
          })
        )
      )
    ) as any

    expect(getAppAccessToken('bad-id', 'secret')).rejects.toThrow('app_id invalid')

    globalThis.fetch = originalFetch
  })
})

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
              expires_in: 6900,
              refresh_expires_in: 2592000,
              refresh_token: 'ur-test-refresh'
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
