import { homedir } from "os"
import { resolve } from "path"

// 测试 1: 动态 import 相对路径
async function testRelativePath() {
  console.log("=== 测试 1: 动态 import 相对路径 ===")
  try {
    const config = await import("./config.toml")
    console.log("✅ 成功!")
    console.log("config:", config)
    console.log("config.default:", config.default)
  } catch (e) {
    console.log("❌ 失败:", e)
  }
}

// 测试 2: 动态 import 绝对路径
async function testAbsolutePath() {
  console.log("\n=== 测试 2: 动态 import 绝对路径 ===")
  const absolutePath = resolve(import.meta.dir, "config.toml")
  console.log("路径:", absolutePath)
  try {
    const config = await import(absolutePath)
    console.log("✅ 成功!")
    console.log("config:", config)
    console.log("config.default:", config.default)
  } catch (e) {
    console.log("❌ 失败:", e)
  }
}

// 测试 3: 动态构建的路径 (模拟用户目录场景)
async function testDynamicPath() {
  console.log("\n=== 测试 3: 动态构建路径 (变量拼接) ===")
  const baseDir = import.meta.dir
  const filename = "config.toml"
  const dynamicPath = `${baseDir}/${filename}`
  console.log("路径:", dynamicPath)
  try {
    const config = await import(dynamicPath)
    console.log("✅ 成功!")
    console.log("config.default:", config.default)
  } catch (e) {
    console.log("❌ 失败:", e)
  }
}

// 运行所有测试
await testRelativePath()
await testAbsolutePath()
await testDynamicPath()
