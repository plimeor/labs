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
