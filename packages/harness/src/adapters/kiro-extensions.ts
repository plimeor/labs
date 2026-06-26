import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { HarnessContext, HookResource } from '../types'
import type { HookExtensionDriver, InstalledHook, JsonObject, McpExtensionDriver } from './extensions'
import {
  createJsonMcpDriver,
  jsonFingerprint,
  mcpServerRecord,
  pathExists,
  readJsonFileFingerprint,
  safeName,
  writeJsonFile
} from './extensions'

export function createKiroMcpDriver(input: {
  configDirectory: string
  configFile: string
  context?: HarnessContext
}): McpExtensionDriver {
  const jsonDriver = createJsonMcpDriver(input.configFile)

  return {
    configFile: input.configFile,
    currentFingerprint: jsonDriver.currentFingerprint,
    async install({ name, server }) {
      const args = ['mcp', 'add', '--scope', 'global', '--name', name, '--command', server.command]

      if (server.args && server.args.length > 0) {
        args.push('--args', JSON.stringify(server.args))
      }

      for (const [key, value] of Object.entries(server.env ?? {})) {
        args.push('--env', `${key}=${value}`)
      }

      await runKiroCommand(input, args)

      const fingerprint = await jsonDriver.currentFingerprint(name)
      if (!fingerprint) {
        await removeKiroMcpServer(input, name)
        throw new Error(`Kiro MCP server ${name} was not written to ${input.configFile}.`)
      }

      return { fingerprint, name, server: mcpServerRecord(server) }
    },
    async remove(name: string) {
      await removeKiroMcpServer(input, name)
    }
  }
}

export function createKiroHookDriver(hooksDirectory: string, events: readonly string[]): HookExtensionDriver {
  return {
    events,
    async conflicts({ extensionId, hooks }) {
      const issues: Awaited<ReturnType<HookExtensionDriver['conflicts']>> = []

      for (const hook of hooks) {
        const targetPath = kiroHookTargetPath(hooksDirectory, extensionId, hook)
        if (await pathExists(targetPath)) {
          issues.push({
            kind: 'conflict',
            reason: `Hook install target already exists: ${targetPath}.`,
            resourceKind: 'hooks',
            resourceName: hook.name
          })
        }
      }

      return issues
    },
    async currentFingerprint(hook: InstalledHook) {
      if (!hook.targetPath) {
        return undefined
      }

      return readJsonFileFingerprint(hook.targetPath)
    },
    async install({ extensionId, hooks }) {
      const installed: InstalledHook[] = []

      for (const hook of hooks) {
        const targetPath = kiroHookTargetPath(hooksDirectory, extensionId, hook)
        const hookConfig = kiroHookConfig(hook)
        await writeJsonFile(targetPath, hookConfig)
        installed.push({
          command: hook.command,
          event: hook.event,
          fingerprint: jsonFingerprint(hookConfig),
          name: hook.name,
          targetPath
        })
      }

      return installed
    },
    async restore(hooks: InstalledHook[]) {
      for (const hook of hooks) {
        if (!hook.targetPath || !hook.name || (await pathExists(hook.targetPath))) {
          continue
        }

        await writeJsonFile(
          hook.targetPath,
          kiroHookConfig({ command: hook.command, event: hook.event, name: hook.name })
        )
      }
    },
    async uninstall(hooks: InstalledHook[]) {
      for (const hook of hooks) {
        if (!hook.targetPath) {
          continue
        }

        const current = await readJsonFileFingerprint(hook.targetPath)
        if (current !== hook.fingerprint) {
          continue
        }

        await rm(hook.targetPath, { force: true })
      }
    }
  }
}

async function removeKiroMcpServer(
  config: { configDirectory: string; context?: HarnessContext },
  name: string
): Promise<void> {
  await runKiroCommand(config, ['mcp', 'remove', '--scope', 'global', '--name', name])
}

async function runKiroCommand(
  config: { configDirectory: string; context?: HarnessContext },
  args: string[]
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const subprocess = Bun.spawn({
    cmd: ['kiro-cli', ...args],
    cwd: config.context?.cwd ?? process.cwd(),
    env: Object.fromEntries(
      Object.entries({
        ...process.env,
        ...(config.context?.home ? { KIRO_HOME: config.configDirectory } : {}),
        ...(config.context?.env ?? {})
      }).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string'
      })
    ),
    stderr: 'pipe',
    stdout: 'pipe'
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text()
  ])

  if (exitCode !== 0) {
    throw new Error(`kiro-cli ${args.join(' ')} failed: ${stderr || stdout}`)
  }

  return { exitCode, stderr, stdout }
}

function kiroHookTargetPath(hooksDirectory: string, extensionId: string, hook: HookResource): string {
  return join(hooksDirectory, `${safeName(extensionId)}__${safeName(hook.name)}.json`)
}

function kiroHookConfig(hook: HookResource): JsonObject {
  return {
    version: 'v1',
    hooks: [
      {
        action: { command: hook.command, type: 'command' },
        enabled: true,
        name: hook.name,
        trigger: hook.event
      }
    ]
  }
}
