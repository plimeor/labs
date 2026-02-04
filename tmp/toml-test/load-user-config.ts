import { homedir } from "os"
import { existsSync } from "fs"

interface OrbitConfig {
  server?: {
    port?: number
    host?: string
  }
  qmd?: {
    enabled?: boolean
    collections?: string[]
  }
}

const defaultConfig: OrbitConfig = {
  server: { port: 3000, host: "localhost" },
  qmd: { enabled: false, collections: [] },
}

async function loadUserConfig(): Promise<OrbitConfig> {
  // 模拟用户配置路径 (实际应该是 ~/.config/orbit/config.toml)
  const configPath = `${import.meta.dir}/config.toml`

  if (!existsSync(configPath)) {
    console.log("配置文件不存在，使用默认配置")
    return defaultConfig
  }

  try {
    // 使用动态 import 加载 TOML
    const module = await import(configPath)
    const userConfig = module.default as OrbitConfig

    // 合并默认配置
    return {
      server: { ...defaultConfig.server, ...userConfig.server },
      qmd: { ...defaultConfig.qmd, ...userConfig.qmd },
    }
  } catch (e) {
    console.error("加载配置失败:", e)
    return defaultConfig
  }
}

// 测试
const config = await loadUserConfig()
console.log("最终配置:", JSON.stringify(config, null, 2))
console.log("\n访问具体值:")
console.log("  server.port:", config.server?.port)
console.log("  qmd.enabled:", config.qmd?.enabled)
console.log("  qmd.collections:", config.qmd?.collections)
