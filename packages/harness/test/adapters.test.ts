import { describe, expect, test } from 'bun:test'
import { lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
  HarnessAdapter,
  HarnessId,
  HarnessRunEvent,
  HarnessRunResult,
  RunOutputRequest,
  RunRequest,
  TextOutputRequest
} from '../src/index'
import { harness } from '../src/index'
import { jsonObjectSchema } from './schema'

const REAL_CLI_TIMEOUT_MS = 90_000

describe('built-in adapters with real CLIs', () => {
  test('self-register on package import', () => {
    expect(harness.list().map(adapter => adapter.id)).toEqual(['claude', 'codex', 'cursor', 'kiro', 'pi'])
  })

  test(
    'detects installed CLIs with identity checks',
    async () => {
      await expect(harness.detectAll()).resolves.toEqual([
        expect.objectContaining({ detected: true, id: 'claude' }),
        expect.objectContaining({ detected: true, id: 'codex' }),
        expect.objectContaining({ detected: true, id: 'cursor' }),
        expect.objectContaining({ detected: true, id: 'kiro' }),
        expect.objectContaining({ detected: true, id: 'pi' })
      ])
    },
    REAL_CLI_TIMEOUT_MS
  )

  test('detect false when the CLI is not available on PATH', async () => {
    const adapter = adapterById('codex')

    await expect(adapter.detect({ env: { PATH: '' } })).resolves.toEqual({ detected: false, id: 'codex' })
  })

  test(
    'health checks installed CLIs by running smoke prompts',
    async () => {
      for (const id of ['claude', 'codex', 'cursor', 'kiro', 'pi'] satisfies HarnessId[]) {
        const handle = await harness.open(id)
        await expect(handle.health.check()).resolves.toEqual({ success: true })
      }
    },
    REAL_CLI_TIMEOUT_MS
  )

  test(
    'plans supported native output modes',
    async () => {
      const codex = await harness.open('codex', { cwd: '/tmp' })
      await expect(
        codex.process.plan({
          output: { mode: 'jsonl' },
          prompt: 'summarize'
        })
      ).resolves.toMatchObject({
        args: ['exec', '--skip-git-repo-check', '--json', 'summarize'],
        harnessId: 'codex',
        output: { mode: 'jsonl' }
      })

      const cursor = await harness.open('cursor', { cwd: '/tmp' })
      await expect(
        cursor.process.plan({
          output: { mode: 'jsonl' },
          prompt: 'summarize'
        })
      ).resolves.toMatchObject({
        args: ['-p', '--force', '--output-format', 'stream-json', 'summarize'],
        harnessId: 'cursor',
        output: { mode: 'jsonl' }
      })

      const pi = await harness.open('pi')
      await expect(
        pi.process.plan({
          output: { mode: 'jsonl' },
          prompt: "say 'ok'"
        })
      ).resolves.toMatchObject({
        args: ['-lc', expect.stringContaining("--mode json 'say '\\''ok'\\'''")],
        command: 'fish',
        harnessId: 'pi',
        output: { mode: 'jsonl' }
      })
    },
    REAL_CLI_TIMEOUT_MS
  )

  test(
    'runs text prompts through every built-in adapter',
    async () => {
      for (const id of ['claude', 'codex', 'cursor', 'kiro', 'pi'] satisfies HarnessId[]) {
        const { result } = await runPrompt(id, {
          prompt: 'Reply with OK only.'
        })

        expect(result.exitCode).toBe(0)
        expect(result.finalText).toContain('OK')
      }
    },
    REAL_CLI_TIMEOUT_MS
  )

  test(
    'runs native JSONL output modes',
    async () => {
      for (const id of ['codex', 'cursor', 'pi'] satisfies HarnessId[]) {
        const { events, result } = await runPrompt(id, {
          output: { mode: 'jsonl' },
          prompt: 'Reply with OK only.'
        })

        expect(result.exitCode).toBe(0)
        expect(result.finalText).toContain('OK')
        expect(events.length).toBeGreaterThan(0)
        expect(events.every(event => event.type === 'json')).toBe(true)
      }
    },
    REAL_CLI_TIMEOUT_MS
  )

  test(
    'runs native structured output modes',
    async () => {
      const schema = jsonObjectSchema<{ answer: string }>(
        {
          additionalProperties: false,
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          type: 'object'
        },
        (value): value is { answer: string } => typeof value.answer === 'string'
      )

      for (const id of ['claude', 'codex'] satisfies HarnessId[]) {
        const { result } = await runPrompt(id, {
          output: { mode: 'structured', schema },
          prompt: 'Return JSON with exactly {"answer":"OK"}.'
        })

        expect(result.exitCode).toBe(0)
        expect(result.structured).toEqual({ answer: 'OK' })
      }
    },
    REAL_CLI_TIMEOUT_MS
  )

  test(
    'throws typed plan errors for unsupported output modes',
    async () => {
      const kiro = await harness.open('kiro')

      await expect(
        kiro.process.plan({
          output: { mode: 'jsonl' },
          prompt: 'summarize'
        })
      ).rejects.toMatchObject({
        kind: 'unsupported_output_mode',
        message: expect.stringContaining('ask the model to emit one valid JSON object per line')
      })

      const schema = jsonObjectSchema<{ answer: string }>(
        {
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          type: 'object'
        },
        (value): value is { answer: string } => typeof value.answer === 'string'
      )

      await expect(
        kiro.process.plan({
          output: { mode: 'structured', schema },
          prompt: 'summarize'
        })
      ).rejects.toMatchObject({
        harnessId: 'kiro',
        kind: 'unsupported_output_mode',
        message: expect.stringContaining(
          'put the required JSON shape, field names, constraints, and validation rules directly in the prompt'
        )
      })

      const cursor = await harness.open('cursor')
      await expect(
        cursor.process.plan({
          output: { mode: 'structured', schema },
          prompt: 'summarize'
        })
      ).rejects.toMatchObject({
        harnessId: 'cursor',
        kind: 'unsupported_output_mode'
      })
    },
    REAL_CLI_TIMEOUT_MS
  )

  test('checks extension compatibility without native writes', async () => {
    const pi = await harness.open('pi')

    await expect(
      pi.extensions.check({
        id: 'tools',
        resources: {
          skills: ['./review.md']
        }
      })
    ).resolves.toEqual({ compatible: true, issues: [] })

    await expect(
      pi.extensions.check({
        id: 'tools',
        resources: {
          hooks: [{ command: 'echo hook', event: 'PreToolUse', name: 'pre' }],
          mcpServers: { docs: { command: 'bun' } }
        }
      })
    ).resolves.toMatchObject({
      compatible: false,
      issues: [
        expect.objectContaining({ resourceKind: 'mcpServers', resourceName: 'docs' }),
        expect.objectContaining({ resourceKind: 'hooks', resourceName: 'pre' })
      ]
    })

    const kiro = await harness.open('kiro')
    await expect(
      kiro.extensions.check({
        id: 'tools',
        resources: {
          hooks: [{ command: 'echo hook', event: 'NotAKiroEvent', name: 'bad' }]
        }
      })
    ).resolves.toMatchObject({
      compatible: false,
      issues: [expect.objectContaining({ resourceKind: 'hooks', resourceName: 'bad' })]
    })
  })

  test('installs and uninstalls Codex user-scope skills, MCP servers, and hooks', async () => {
    const { cwd, home } = await testWorkspace()
    await mkdir(join(cwd, 'skills', 'review'), { recursive: true })
    await writeFile(join(cwd, 'skills', 'review', 'SKILL.md'), '# Review\n')
    const handle = await harness.open('codex', { cwd, home })

    const installed = await handle.extensions.install({
      id: 'tools',
      resources: {
        hooks: [{ command: 'echo hook', event: 'PreToolUse', name: 'pre' }],
        mcpServers: { docs: { args: ['server.ts'], command: 'bun' } },
        skills: ['./skills/review']
      }
    })

    expect(installed.issues).toEqual([])
    await expect(lstat(join(home, '.codex', 'skills', 'tools__0_review'))).resolves.toMatchObject({
      isSymbolicLink: expect.any(Function)
    })
    await expect(readFile(join(home, '.codex', 'config.toml'), 'utf8')).resolves.toContain('[mcp_servers.docs]')
    const hooks = JSON.parse(await readFile(join(home, '.codex', 'hooks.json'), 'utf8'))
    expect(hooks.hooks.PreToolUse).toEqual([{ hooks: [{ command: 'echo hook', type: 'command' }] }])

    await expect(handle.extensions.uninstall('tools')).resolves.toEqual({ issues: [], success: true })
    await expect(lstat(join(home, '.codex', 'skills', 'tools__0_review'))).rejects.toThrow()
    await expect(readFile(join(home, '.codex', 'config.toml'), 'utf8')).resolves.not.toContain('[mcp_servers.docs]')
    const hooksAfterUninstall = JSON.parse(await readFile(join(home, '.codex', 'hooks.json'), 'utf8'))
    expect(hooksAfterUninstall.hooks.PreToolUse).toEqual([])
  })

  test('installs and uninstalls Claude user-scope skills, MCP servers, and hooks', async () => {
    const { cwd, home } = await testWorkspace()
    await writeFile(join(cwd, 'review.md'), '# Review\n')
    const handle = await harness.open('claude', { cwd, home })

    await expect(
      handle.extensions.install({
        id: 'tools',
        resources: {
          hooks: [{ command: 'echo hook', event: 'ConfigChange', name: 'config' }],
          mcpServers: { docs: { args: ['server.ts'], command: 'bun', env: { DOCS_ROOT: '/tmp/docs' } } },
          skills: ['./review.md']
        }
      })
    ).resolves.toEqual({ issues: [], success: true })

    await expect(lstat(join(home, '.claude', 'skills', 'tools__0_review', 'SKILL.md'))).resolves.toMatchObject({
      isSymbolicLink: expect.any(Function)
    })
    const mcpConfig = JSON.parse(await readFile(join(home, '.claude', 'mcp.json'), 'utf8'))
    expect(mcpConfig.mcpServers.docs).toEqual({
      args: ['server.ts'],
      command: 'bun',
      env: { DOCS_ROOT: '/tmp/docs' }
    })
    const settings = JSON.parse(await readFile(join(home, '.claude', 'settings.json'), 'utf8'))
    expect(settings.hooks.ConfigChange).toEqual([{ hooks: [{ command: 'echo hook', type: 'command' }] }])

    await expect(handle.extensions.uninstall('tools')).resolves.toEqual({ issues: [], success: true })
    await expect(lstat(join(home, '.claude', 'skills', 'tools__0_review'))).rejects.toThrow()
    const mcpAfterUninstall = JSON.parse(await readFile(join(home, '.claude', 'mcp.json'), 'utf8'))
    const settingsAfterUninstall = JSON.parse(await readFile(join(home, '.claude', 'settings.json'), 'utf8'))
    expect(mcpAfterUninstall.mcpServers.docs).toBeUndefined()
    expect(settingsAfterUninstall.hooks.ConfigChange).toEqual([])
  })

  test('installs and uninstalls Cursor user-scope skills, MCP servers, and hooks', async () => {
    const { cwd, home } = await testWorkspace()
    await writeFile(join(cwd, 'review.md'), '# Review\n')
    const handle = await harness.open('cursor', { cwd, home })

    await expect(
      handle.extensions.install({
        id: 'tools',
        resources: {
          hooks: [{ command: 'echo hook', event: 'beforeShellExecution', name: 'shell' }],
          mcpServers: { docs: { args: ['server.ts'], command: 'bun', env: { DOCS_ROOT: '/tmp/docs' } } },
          skills: ['./review.md']
        }
      })
    ).resolves.toEqual({ issues: [], success: true })

    await expect(lstat(join(home, '.cursor', 'skills', 'tools__0_review', 'SKILL.md'))).resolves.toMatchObject({
      isSymbolicLink: expect.any(Function)
    })
    const mcpConfig = JSON.parse(await readFile(join(home, '.cursor', 'mcp.json'), 'utf8'))
    expect(mcpConfig.mcpServers.docs).toEqual({
      args: ['server.ts'],
      command: 'bun',
      env: { DOCS_ROOT: '/tmp/docs' }
    })
    const hooks = JSON.parse(await readFile(join(home, '.cursor', 'hooks.json'), 'utf8'))
    expect(hooks).toEqual({
      hooks: { beforeShellExecution: [{ command: 'echo hook' }] },
      version: 1
    })

    await expect(handle.extensions.uninstall('tools')).resolves.toEqual({ issues: [], success: true })
    await expect(lstat(join(home, '.cursor', 'skills', 'tools__0_review'))).rejects.toThrow()
    const mcpAfterUninstall = JSON.parse(await readFile(join(home, '.cursor', 'mcp.json'), 'utf8'))
    const hooksAfterUninstall = JSON.parse(await readFile(join(home, '.cursor', 'hooks.json'), 'utf8'))
    expect(mcpAfterUninstall.mcpServers.docs).toBeUndefined()
    expect(hooksAfterUninstall.hooks.beforeShellExecution).toEqual([])
  })

  test('rejects unsupported Cursor hook events during extension checks', async () => {
    const cursor = await harness.open('cursor')

    await expect(
      cursor.extensions.check({
        id: 'tools',
        resources: {
          hooks: [{ command: 'echo hook', event: 'NotACursorEvent', name: 'bad' }]
        }
      })
    ).resolves.toMatchObject({
      compatible: false,
      issues: [expect.objectContaining({ resourceKind: 'hooks', resourceName: 'bad' })]
    })
  })

  test(
    'installs and uninstalls Kiro user-scope skills, MCP servers, and hooks through kiro-cli',
    async () => {
      const { cwd, home } = await testWorkspace()
      await writeFile(join(cwd, 'review.md'), '# Review\n')
      const kiroHome = join(home, '.kiro')
      const handle = await harness.open('kiro', { cwd, env: { KIRO_HOME: kiroHome }, home })

      await expect(
        handle.extensions.install({
          id: 'tools',
          resources: {
            hooks: [{ command: 'echo hook', event: 'PreToolUse', name: 'pre' }],
            skills: ['./review.md'],
            mcpServers: {
              docs: { args: ['--version'], command: 'bun', env: { DOCS_ROOT: '/tmp/docs' } }
            }
          }
        })
      ).resolves.toEqual({ issues: [], success: true })

      await expect(lstat(join(home, '.kiro', 'skills', 'tools__0_review', 'SKILL.md'))).resolves.toMatchObject({
        isSymbolicLink: expect.any(Function)
      })
      const mcpConfig = JSON.parse(await readFile(join(home, '.kiro', 'settings', 'mcp.json'), 'utf8'))
      expect(mcpConfig.mcpServers.docs).toEqual({
        args: ['--version'],
        command: 'bun',
        env: { DOCS_ROOT: '/tmp/docs' }
      })
      const hookConfig = JSON.parse(await readFile(join(home, '.kiro', 'hooks', 'tools__pre.json'), 'utf8'))
      expect(hookConfig).toEqual({
        version: 'v1',
        hooks: [
          {
            action: { command: 'echo hook', type: 'command' },
            enabled: true,
            name: 'pre',
            trigger: 'PreToolUse'
          }
        ]
      })

      await expect(handle.extensions.uninstall('tools')).resolves.toEqual({ issues: [], success: true })
      await expect(readFile(join(home, '.kiro', 'hooks', 'tools__pre.json'), 'utf8')).rejects.toThrow()
      const mcpAfterUninstall = JSON.parse(await readFile(join(home, '.kiro', 'settings', 'mcp.json'), 'utf8'))
      expect(mcpAfterUninstall.mcpServers.docs).toBeUndefined()
    },
    REAL_CLI_TIMEOUT_MS
  )

  test('reports unsupported adapter extension resources without partial install', async () => {
    const { cwd, home } = await testWorkspace()
    await writeFile(join(cwd, 'review.md'), '# Review\n')
    const handle = await harness.open('pi', { cwd, home })

    const installed = await handle.extensions.install({
      id: 'tools',
      resources: {
        hooks: [{ command: 'echo hook', event: 'PreToolUse', name: 'pre' }],
        mcpServers: { docs: { command: 'bun' } },
        skills: ['./review.md']
      }
    })

    expect(installed.issues.map(issue => `${issue.resourceKind}:${issue.resourceName}`)).toEqual([
      'mcpServers:docs',
      'hooks:pre'
    ])
    await expect(lstat(join(home, '.pi', 'agent', 'skills', 'tools__0_review', 'SKILL.md'))).rejects.toThrow()
  })

  test('installs and uninstalls Pi user-scope skills', async () => {
    const { cwd, home } = await testWorkspace()
    await writeFile(join(cwd, 'review.md'), '# Review\n')
    const handle = await harness.open('pi', { cwd, home })

    await expect(
      handle.extensions.install({
        id: 'tools',
        resources: {
          skills: ['./review.md']
        }
      })
    ).resolves.toEqual({ issues: [], success: true })

    await expect(lstat(join(home, '.pi', 'agent', 'skills', 'tools__0_review', 'SKILL.md'))).resolves.toMatchObject({
      isSymbolicLink: expect.any(Function)
    })

    await expect(handle.extensions.uninstall('tools')).resolves.toEqual({ issues: [], success: true })
    await expect(lstat(join(home, '.pi', 'agent', 'skills', 'tools__0_review'))).rejects.toThrow()
  })
})

function adapterById(id: string): HarnessAdapter {
  const adapter = harness.list().find(candidate => candidate.id === id)
  if (!adapter) {
    throw new Error(`Missing adapter ${id}`)
  }

  return adapter
}

async function runPrompt<Output extends RunOutputRequest = TextOutputRequest>(
  id: HarnessId,
  request: RunRequest<Output>
): Promise<{
  events: HarnessRunEvent[]
  result: HarnessRunResult<Output>
}> {
  const handle = await harness.open(id)
  const plan = await handle.process.plan({ timeoutMs: REAL_CLI_TIMEOUT_MS, ...request })
  const run = await handle.process.run(plan)
  const [events, result] = await Promise.all([collectEvents(run.events), run.result])
  return { events, result }
}

async function collectEvents(iterable: AsyncIterable<HarnessRunEvent>): Promise<HarnessRunEvent[]> {
  const events: HarnessRunEvent[] = []
  for await (const event of iterable) {
    events.push(event)
  }
  return events
}

async function testWorkspace(): Promise<{ cwd: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), 'harness-adapter-test-'))
  const cwd = join(root, 'cwd')
  const home = join(root, 'home')
  await mkdir(cwd, { recursive: true })
  await mkdir(home, { recursive: true })
  return { cwd, home }
}
