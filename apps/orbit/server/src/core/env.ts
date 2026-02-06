import { DEFAULT_PORT } from '@orbit/shared/constants'

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || String(DEFAULT_PORT), 10),
} as const

export const isDevelopment = env.NODE_ENV === 'development'
export const isProduction = env.NODE_ENV === 'production'
