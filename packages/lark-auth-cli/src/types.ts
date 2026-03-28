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
