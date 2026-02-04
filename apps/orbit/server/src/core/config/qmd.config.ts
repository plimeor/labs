import { existsSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

interface QmdConfig {
  enabled: boolean
  collections: Record<string, string[]>
}

let cachedConfig: QmdConfig | undefined

const defaultConfig: QmdConfig = {
  enabled: true,
  collections: {},
}

/**
 * Load QMD config from TOML file using Bun's native dynamic import
 * No third-party library needed - Bun handles TOML parsing natively
 */
export async function getQmdConfig(): Promise<QmdConfig> {
  if (cachedConfig) return cachedConfig

  const configPath = resolve(homedir(), '.config/orbit/config.toml')

  if (!existsSync(configPath)) {
    cachedConfig = defaultConfig
    return cachedConfig
  }

  try {
    const module = await import(configPath)
    const parsed = module.default

    cachedConfig = {
      ...defaultConfig,
      ...parsed.qmd,
    }
  } catch {
    cachedConfig = defaultConfig
  }

  return cachedConfig
}

export async function isQmdEnabled(): Promise<boolean> {
  const config = await getQmdConfig()
  return config.enabled
}

export function clearConfigCache(): void {
  cachedConfig = undefined
}
