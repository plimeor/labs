import { describe, expect, test } from 'bun:test'
import { lstat, mkdir, readlink, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { listAgentTargets, planAgentTargetReconciliation, reconcileAgentTarget } from '../src/agent-targets'
import { resolveScope } from '../src/scope'
import { tempDir } from './helpers/fs'
import { withCwd, withHome } from './helpers/process'

describe('agent target reconciliation', () => {
  test('classifies native agents and detected non-native agents as directory symlink targets', async () => {
    const home = await tempDir('skills-agent-targets-home-')
    await mkdir(join(home, '.codex'), { recursive: true })
    await mkdir(join(home, '.claude'), { recursive: true })

    const plan = await withIsolatedAgentEnv(home, async () => planAgentTargetReconciliation(resolveScope(true)))
    const codex = requireEntry(plan.entries, 'codex')
    const claude = requireEntry(plan.entries, 'claude-code')
    const kiro = requireEntry(plan.entries, 'kiro-cli')

    expect(codex).toMatchObject({
      action: 'skip-native',
      detected: true,
      linkMode: 'native',
      native: true,
      targetDir: join(home, '.agents', 'skills')
    })
    expect(claude).toMatchObject({
      action: 'create-directory-symlink',
      detected: true,
      linkMode: 'directory-symlink',
      native: false,
      targetDir: join(home, '.claude', 'skills')
    })
    expect(kiro).toMatchObject({
      action: 'skip-undetected',
      detected: false,
      linkMode: 'undetected',
      native: false
    })
  })

  test('creates a detected non-native directory symlink without writing agent state files', async () => {
    const home = await tempDir('skills-agent-targets-link-home-')
    await mkdir(join(home, '.claude'), { recursive: true })

    await withIsolatedAgentEnv(home, async () => {
      await reconcileAgentTarget(resolveScope(true), 'claude-code')
    })

    const target = join(home, '.claude', 'skills')
    expect((await lstat(target)).isSymbolicLink()).toBe(true)
    expect(await readlink(target)).toBe(join(home, '.agents', 'skills'))
    await expect(lstat(join(home, '.agents', 'skills.json'))).rejects.toThrow()
    await expect(lstat(join(home, '.agents', 'skills.lock.json'))).rejects.toThrow()
  })

  test('replaces existing directories, files, and non-canonical symlinks with canonical directory symlinks', async () => {
    const home = await tempDir('skills-agent-targets-blocked-home-')
    await mkdir(join(home, '.claude', 'skills'), { recursive: true })
    await mkdir(join(home, '.kiro'), { recursive: true })
    await writeFile(join(home, '.kiro', 'skills'), 'owned by user')
    await mkdir(join(home, '.continue'), { recursive: true })
    await symlink(join(home, 'other-skills'), join(home, '.continue', 'skills'), 'dir')

    const plan = await withIsolatedAgentEnv(home, async () => planAgentTargetReconciliation(resolveScope(true)))

    expect(requireEntry(plan.entries, 'claude-code')).toMatchObject({
      action: 'replace-directory-symlink',
      linkMode: 'directory-symlink',
      reason: 'target already exists as a directory'
    })
    expect(requireEntry(plan.entries, 'kiro-cli')).toMatchObject({
      action: 'replace-directory-symlink',
      linkMode: 'directory-symlink',
      reason: 'target already exists as a file'
    })
    expect(requireEntry(plan.entries, 'continue')).toMatchObject({
      action: 'replace-directory-symlink',
      linkMode: 'directory-symlink',
      reason: 'target symlink points to ~/other-skills'
    })

    await withIsolatedAgentEnv(home, async () => {
      await reconcileAgentTarget(resolveScope(true), 'claude-code')
      await reconcileAgentTarget(resolveScope(true), 'kiro-cli')
      await reconcileAgentTarget(resolveScope(true), 'continue')
    })

    expect(await readlink(join(home, '.claude', 'skills'))).toBe(join(home, '.agents', 'skills'))
    expect(await readlink(join(home, '.kiro', 'skills'))).toBe(join(home, '.agents', 'skills'))
    expect(await readlink(join(home, '.continue', 'skills'))).toBe(join(home, '.agents', 'skills'))
  })

  test('agents list data preserves standard then detected groups and only includes detected agents', async () => {
    const home = await tempDir('skills-agent-list-home-')
    await mkdir(join(home, '.codex'), { recursive: true })

    const data = await withIsolatedAgentEnv(home, async () => listAgentTargets(resolveScope(true)))

    expect(data.groups.map(group => group.id)).toEqual(['standard', 'detected'])
    expect(data.groups[0].agents.some(agent => agent.id === 'codex' && agent.native)).toBe(true)
    expect(data.groups.flatMap(group => group.agents).some(agent => agent.id === 'claude-code')).toBe(false)
  })

  test('agents list all groups standard, detected, and not-detected agents', async () => {
    const home = await tempDir('skills-agent-list-all-home-')
    await mkdir(join(home, '.codex'), { recursive: true })
    await mkdir(join(home, '.claude'), { recursive: true })

    const data = await withIsolatedAgentEnv(home, async () => listAgentTargets(resolveScope(true), { all: true }))

    expect(data.groups.map(group => group.id)).toEqual(['standard', 'detected', 'not-detected'])
    expect(data.groups[0].agents.map(agent => agent.id)).toContain('codex')
    expect(data.groups[1].agents.map(agent => agent.id)).toContain('claude-code')
    expect(data.groups[2].agents.map(agent => agent.id)).toContain('kiro-cli')
  })

  test('project scope only detects project-level agent markers', async () => {
    const home = await tempDir('skills-agent-project-home-')
    const cwd = await tempDir('skills-agent-project-cwd-')
    await mkdir(join(home, '.claude'), { recursive: true })

    const withoutProjectMarker = await withIsolatedAgentEnv(home, () => listAgentTargets(resolveScope(false)), { cwd })

    expect(withoutProjectMarker.groups.flatMap(group => group.agents).some(agent => agent.id === 'claude-code')).toBe(
      false
    )

    await mkdir(join(cwd, '.claude'), { recursive: true })

    const withProjectMarker = await withIsolatedAgentEnv(home, () => listAgentTargets(resolveScope(false)), { cwd })
    const detectedAgents = withProjectMarker.groups[1].agents

    expect(detectedAgents.find(agent => agent.id === 'claude-code')).toMatchObject({
      detected: true,
      targetDir: join(await realpath(cwd), '.claude', 'skills')
    })
  })
})

function requireEntry(entries: { id: string }[], id: string) {
  const entry = entries.find(item => item.id === id)
  if (!entry) {
    throw new Error(`Missing agent entry: ${id}`)
  }

  return entry
}

async function withIsolatedAgentEnv<T>(
  home: string,
  callback: () => Promise<T>,
  options: { cwd?: string } = {}
): Promise<T> {
  const configHome = join(home, '.config')
  const cwd = options.cwd ?? (await tempDir('skills-agent-targets-cwd-'))
  const previous = {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
    VIBE_HOME: process.env.VIBE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME
  }
  process.env.XDG_CONFIG_HOME = configHome
  delete process.env.CLAUDE_CONFIG_DIR
  delete process.env.CODEX_HOME
  delete process.env.VIBE_HOME
  try {
    return await withHome(home, () => withCwd(cwd, callback))
  } finally {
    restoreEnv('CLAUDE_CONFIG_DIR', previous.CLAUDE_CONFIG_DIR)
    restoreEnv('CODEX_HOME', previous.CODEX_HOME)
    restoreEnv('VIBE_HOME', previous.VIBE_HOME)
    restoreEnv('XDG_CONFIG_HOME', previous.XDG_CONFIG_HOME)
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}
