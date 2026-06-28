import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createCodexMcpDriver } from '../src/adapters/codex-extensions'
import { createExtensionFacet, writeJsonFile } from '../src/adapters/extensions'
import { createKiroHookDriver } from '../src/adapters/kiro-extensions'

describe('extension reinstall behavior', () => {
  test('keeps existing skill targets protected by default', async () => {
    const { configDirectory, cwd, home } = await testWorkspace()
    const skillsDirectory = join(configDirectory, 'skills')
    const skillSource = join(cwd, 'review.md')
    const skillTarget = join(skillsDirectory, 'tools__0_review')

    await writeFile(skillSource, '# Review\n')
    await mkdir(skillTarget, { recursive: true })
    await writeFile(join(skillTarget, 'SKILL.md'), '# Existing\n')

    const extensions = createExtensionFacet({
      configDirectory,
      context: { cwd, home },
      harnessId: 'test',
      skillsDirectory
    })

    const result = await extensions.install({
      id: 'tools',
      resources: { skills: ['./review.md'] }
    })

    expect(result.success).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({
        reason: `Skill install target already exists: ${skillTarget}.`,
        resourceKind: 'skills'
      })
    ])
    expect(await readFile(join(skillTarget, 'SKILL.md'), 'utf8')).toBe('# Existing\n')
  })

  test('replaces Kiro skill targets with the same extension-generated name', async () => {
    const { configDirectory, cwd, home } = await testWorkspace()
    const skillsDirectory = join(configDirectory, 'skills')
    const skillSource = join(cwd, 'review.md')
    const skillTarget = join(skillsDirectory, 'tools__0_review')

    await writeFile(skillSource, '# Review\n')
    await mkdir(skillTarget, { recursive: true })
    await writeFile(join(skillTarget, 'SKILL.md'), '# Existing\n')

    const extensions = createExtensionFacet({
      configDirectory,
      context: { cwd, home },
      harnessId: 'kiro',
      replaceExistingTargets: { skills: true },
      skillsDirectory
    })

    await expect(
      extensions.install({
        id: 'tools',
        resources: { skills: ['./review.md'] }
      })
    ).resolves.toEqual({ issues: [], success: true })

    await expect(lstat(join(skillTarget, 'SKILL.md'))).resolves.toMatchObject({
      isSymbolicLink: expect.any(Function)
    })
    expect(await readlink(join(skillTarget, 'SKILL.md'))).toBe(skillSource)
  })

  test('replaces Kiro hook files with the same extension-generated name', async () => {
    const { configDirectory } = await testWorkspace()
    const hooksDirectory = join(configDirectory, 'hooks')
    const hookConfigFile = join(hooksDirectory, 'tools__session-start.json')
    const hook = { command: 'echo ready', event: 'SessionStart', name: 'session-start' }

    await writeJsonFile(hookConfigFile, kiroHookConfig({ ...hook, command: 'echo old' }))

    const extensions = createExtensionFacet({
      configDirectory,
      harnessId: 'kiro',
      hooks: createKiroHookDriver(hooksDirectory, ['SessionStart'])
    })

    await expect(
      extensions.install({
        id: 'tools',
        resources: { hooks: [hook] }
      })
    ).resolves.toEqual({ issues: [], success: true })

    const hookConfig = JSON.parse(await readFile(hookConfigFile, 'utf8'))
    expect(hookConfig.hooks[0].action.command).toBe('echo ready')
    const state = JSON.parse(await readFile(join(configDirectory, 'harness-extensions.json'), 'utf8'))
    expect(state.extensions.tools.hooks).toHaveLength(1)
  })

  test('reinstalls a named Kiro hook when its command changes', async () => {
    const { configDirectory } = await testWorkspace()
    const hooksDirectory = join(configDirectory, 'hooks')
    const extensions = createExtensionFacet({
      configDirectory,
      harnessId: 'kiro',
      hooks: createKiroHookDriver(hooksDirectory, ['SessionStart'])
    })

    await expect(
      extensions.install({
        id: 'tools',
        resources: {
          hooks: [{ command: 'echo old', event: 'SessionStart', name: 'session-start' }]
        }
      })
    ).resolves.toEqual({ issues: [], success: true })

    await expect(
      extensions.install({
        id: 'tools',
        resources: {
          hooks: [{ command: 'echo new', event: 'SessionStart', name: 'session-start' }]
        }
      })
    ).resolves.toEqual({ issues: [], success: true })

    const hookConfig = JSON.parse(await readFile(join(hooksDirectory, 'tools__session-start.json'), 'utf8'))
    expect(hookConfig.hooks[0].action.command).toBe('echo new')
  })

  test('reinstalls a Codex MCP server and removes old ownership markers', async () => {
    const { configDirectory } = await testWorkspace()
    const configFile = join(configDirectory, 'config.toml')
    const extensions = createExtensionFacet({
      configDirectory,
      harnessId: 'codex',
      mcp: createCodexMcpDriver(configFile)
    })
    const extension = {
      id: 'tools',
      resources: {
        mcpServers: {
          docs: { args: ['server.ts'], command: 'bun' }
        }
      }
    }
    const marker = '# @plimeor/harness extension = tools'

    await mkdir(configDirectory, { recursive: true })
    await writeFile(
      configFile,
      [
        '[mcp_servers.docs]',
        'command = "bun"',
        'args = ["server.ts"]',
        '',
        '[hooks.state]',
        'trusted_hash = "sha256:abc"',
        marker,
        ''
      ].join('\n')
    )
    await writeJsonFile(join(configDirectory, 'harness-extensions.json'), {
      extensions: {
        tools: {
          hooks: [],
          skills: [],
          mcpServers: [
            {
              fingerprint: textFingerprint(
                ['[mcp_servers.docs]', 'command = "bun"', 'args = ["server.ts"]', marker].join('\n')
              ),
              name: 'docs',
              server: { args: ['server.ts'], command: 'bun' }
            }
          ]
        }
      }
    })

    await expect(extensions.install(extension)).resolves.toEqual({ issues: [], success: true })

    const reinstalledConfig = await readFile(configFile, 'utf8')
    expect(countOccurrences(reinstalledConfig, '[mcp_servers.docs]')).toBe(1)
    expect(countOccurrences(reinstalledConfig, marker)).toBe(0)
    expect(reinstalledConfig).toContain('[hooks.state]\ntrusted_hash = "sha256:abc"')
  })
})

function kiroHookConfig(hook: { command: string; event: string; name: string }): Record<string, unknown> {
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

async function testWorkspace(): Promise<{ configDirectory: string; cwd: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), 'harness-extension-reinstall-test-'))
  const cwd = join(root, 'cwd')
  const home = join(root, 'home')
  const configDirectory = join(home, '.host')
  await mkdir(cwd, { recursive: true })
  await mkdir(home, { recursive: true })
  return { configDirectory, cwd, home }
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1
}

function textFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
