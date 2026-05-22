import { describe, expect, test } from 'bun:test'
import { lstat, mkdir, readlink, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { $ } from 'bun'

import { agentsAddCommand } from '../../src/commands/agents'
import { tempDir } from '../helpers/fs'
import { captureStdout, withHome } from '../helpers/process'

describe('agents command', () => {
  test('lists supported agents as JSON without writing state or symlinks', async () => {
    const home = await tempDir('skills-agents-command-home-')
    await mkdir(join(home, '.codex'), { recursive: true })
    await mkdir(join(home, '.claude'), { recursive: true })

    const output = await $`bun ${cliPath()} agents list -g --json`.env(isolatedAgentEnv(home)).quiet().json()

    expect(output.ok).toBe(true)
    expect(output.data.groups.map((group: { id: string }) => group.id)).toEqual(['standard', 'detected'])
    const universalAgents = output.data.groups[0].agents as AgentEntry[]
    const agentTargets = output.data.groups[1].agents as AgentEntry[]
    expect(universalAgents.find(agent => agent.id === 'codex')).toMatchObject({
      detected: true,
      linkMode: 'native',
      native: true,
      targetDir: join(home, '.agents', 'skills')
    })
    expect(agentTargets.find(agent => agent.id === 'claude-code')).toMatchObject({
      detected: true,
      linkMode: 'directory-symlink',
      native: false,
      targetDir: join(home, '.claude', 'skills')
    })
    expect(agentTargets.some(agent => agent.id === 'kiro-cli')).toBe(false)

    await expect(lstat(join(home, '.agents', 'skills.json'))).rejects.toThrow()
    await expect(lstat(join(home, '.claude', 'skills'))).rejects.toThrow()
  })

  test('replaces an existing detected agent global target with a global canonical skills directory link', async () => {
    const home = await tempDir('skills-agents-command-add-home-')
    await mkdir(join(home, '.claude', 'skills'), { recursive: true })

    const output = await $`bun ${cliPath()} agents add claude-code -g --json`.env(isolatedAgentEnv(home)).quiet().json()

    expect(output.ok).toBe(true)
    expect(output.data).toMatchObject({
      action: 'replace-directory-symlink',
      id: 'claude-code',
      targetDir: join(home, '.claude', 'skills')
    })
    expect((await lstat(join(home, '.claude', 'skills'))).isSymbolicLink()).toBe(true)
    expect(await readlink(join(home, '.claude', 'skills'))).toBe(join(home, '.agents', 'skills'))
  })

  test('replaces an existing detected agent project target with a project canonical skills directory link', async () => {
    const cwd = await tempDir('skills-agents-command-add-project-cwd-')
    const realCwd = await realpath(cwd)
    const home = await tempDir('skills-agents-command-add-project-home-')
    await mkdir(join(home, '.claude'), { recursive: true })
    await mkdir(join(cwd, '.claude', 'skills'), { recursive: true })

    const output = await $`bun ${cliPath()} agents add claude-code --json`
      .cwd(cwd)
      .env(isolatedAgentEnv(home))
      .quiet()
      .json()

    expect(output.ok).toBe(true)
    expect(output.data).toMatchObject({
      action: 'replace-directory-symlink',
      id: 'claude-code',
      targetDir: join(realCwd, '.claude', 'skills')
    })
    expect((await lstat(join(cwd, '.claude', 'skills'))).isSymbolicLink()).toBe(true)
    expect(await readlink(join(cwd, '.claude', 'skills'))).toBe(join(realCwd, '.agents', 'skills'))
  })

  test('requires an interactive prompt before creating a missing agent marker directory', async () => {
    const home = await tempDir('skills-agents-command-add-missing-marker-home-')

    const output = await $`bun ${cliPath()} agents add kiro-cli -g --json`
      .env(isolatedAgentEnv(home))
      .nothrow()
      .quiet()
      .json()

    expect(output.ok).toBe(false)
    expect(output.error.message).toContain('Interactive prompts are not available with --json')
    await expect(lstat(join(home, '.kiro'))).rejects.toThrow()
  })

  test('creates a missing agent marker directory after confirmation and links the agent target', async () => {
    const home = await tempDir('skills-agents-command-add-create-marker-home-')

    let entry: Awaited<ReturnType<typeof agentsAddCommand>> | undefined
    await captureStdout(async () => {
      entry = await withHome(home, () =>
        agentsAddCommand({
          args: { agentId: 'kiro-cli' },
          options: { global: true },
          confirmCreateAgentMarker: async () => true
        })
      )
    })

    expect(entry).toMatchObject({
      action: 'create-directory-symlink',
      id: 'kiro-cli',
      targetDir: join(home, '.kiro', 'skills')
    })
    expect((await lstat(join(home, '.kiro', 'skills'))).isSymbolicLink()).toBe(true)
    expect(await readlink(join(home, '.kiro', 'skills'))).toBe(join(home, '.agents', 'skills'))
  })

  test('lists all agents grouped by standard, detected, and not-detected status', async () => {
    const home = await tempDir('skills-agents-command-list-all-home-')
    await mkdir(join(home, '.codex'), { recursive: true })
    await mkdir(join(home, '.claude'), { recursive: true })

    const output = await $`bun ${cliPath()} agents list -g --all --json`.env(isolatedAgentEnv(home)).quiet().json()

    expect(output.ok).toBe(true)
    expect(output.data.groups.map((group: { id: string }) => group.id)).toEqual([
      'standard',
      'detected',
      'not-detected'
    ])
    expect(output.data.groups[0].agents.map((agent: AgentEntry) => agent.id)).toContain('codex')
    expect(output.data.groups[1].agents.map((agent: AgentEntry) => agent.id)).toContain('claude-code')
    expect(output.data.groups[2].agents.map((agent: AgentEntry) => agent.id)).toContain('kiro-cli')
  })

  test('dims blocked agents in human output for unsafe target relationships', async () => {
    const home = await tempDir('skills-agents-command-blocked-home-')
    await mkdir(join(home, '.agents'), { recursive: true })
    const env = isolatedAgentEnv(home)
    env.CLAUDE_CONFIG_DIR = join(home, '.agents')

    const output = await $`bun ${cliPath()} agents list -g`.env(env).quiet().text()

    expect(output).toContain('\u001B[2m  ⚪ claude-code \u001B[90m~/.agents/skills\u001B[39m\u001B[22m')
    expect(output).not.toContain('Claude Code')
    expect(output).not.toContain('blocked, target')
    expect(output).toContain('\u001B[90m  🔗 linked to standard path  ⚪ not linked to standard path\u001B[39m')
    expect(output).toContain('\u001B[90m│\u001B[39m\n\u001B[90m│\u001B[39m  \u001B[2m')
    expect(output.indexOf('⚪ not linked to standard path')).toBeLessThan(output.indexOf('  ⚪ claude-code'))
  })

  test('marks linked detected agents in human output', async () => {
    const home = await tempDir('skills-agents-command-linked-home-')
    await mkdir(join(home, '.agents', 'skills'), { recursive: true })
    await mkdir(join(home, '.claude'), { recursive: true })
    await $`ln -s ${join(home, '.agents', 'skills')} ${join(home, '.claude', 'skills')}`.quiet()

    const output = await $`bun ${cliPath()} agents list -g`.env(isolatedAgentEnv(home)).quiet().text()

    expect(output).toContain('  🔗 claude-code \u001B[90m~/.claude/skills\u001B[39m')
  })

  test('omits native paths in human output', async () => {
    const home = await tempDir('skills-agents-command-native-home-')
    await mkdir(join(home, '.codex'), { recursive: true })

    const output = await $`bun ${cliPath()} agents list -g`.env(isolatedAgentEnv(home)).quiet().text()

    expect(output).toContain('  codex\n')
    expect(output).not.toContain('Codex')
    expect(output).not.toContain('codex ')
    expect(output).not.toContain('native, target')
  })

  test('prints group help for the agents command', async () => {
    const home = await tempDir('skills-agents-command-help-home-')
    const output = await $`bun ${cliPath()} agents --help`.env(isolatedAgentEnv(home)).quiet().text()

    expect(output).toContain('skills agents')
    expect(output).toContain('add')
    expect(output).toContain('list')
  })
})

type AgentEntry = {
  detected: boolean
  id: string
  linkMode: string
  native: boolean
  targetDir: string
}

function cliPath(): string {
  return Bun.resolveSync('../../src/cli', import.meta.dir)
}

function isolatedAgentEnv(home: string): NodeJS.ProcessEnv {
  const env = { ...process.env }
  env.HOME = home
  env.XDG_CONFIG_HOME = join(home, '.config')
  delete env.CLAUDE_CONFIG_DIR
  delete env.CODEX_HOME
  delete env.VIBE_HOME
  return env
}
