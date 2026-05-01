import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { $ } from 'zx'

import { syncCommand } from '../../src/commands/sync.js'
import { SyncPlan } from '../../src/sync-plan.js'
import { tempDir, writeGlobalManifest, writeProjectLock, writeProjectManifest } from '../helpers/fs.js'
import { captureStdout, withCwd, withHome } from '../helpers/process.js'

describe('sync planning', () => {
  test('refreshes refs by default and uses locked commits only in locked mode', () => {
    const manifest = {
      schemaVersion: 1 as const,
      scope: 'global' as const,
      skills: [
        { name: 'a', path: 'skills/a', ref: 'main', source: 'repo' },
        { commit: 'pinned', name: 'b', path: 'skills/b', source: 'repo' }
      ]
    }
    const lock = {
      schemaVersion: 1 as const,
      scope: 'global' as const,
      skills: {
        a: {
          commit: 'locked-a',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: '/tmp/a',
          method: 'copy' as const,
          path: 'skills/a',
          ref: 'main',
          source: 'repo'
        },
        b: {
          commit: 'pinned',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: '/tmp/b',
          method: 'copy' as const,
          path: 'skills/b',
          source: 'repo'
        },
        stale: {
          commit: 'stale',
          installedAt: '2026-04-25T00:00:00.000Z',
          installPath: '/tmp/stale',
          method: 'copy' as const,
          source: 'repo'
        }
      }
    }

    expect(SyncPlan.plan(manifest, lock, { locked: false })).toMatchObject({
      pruneNames: ['stale'],
      installRequests: [
        { ref: 'main', source: 'repo' },
        { commit: 'pinned', source: 'repo' }
      ]
    })
    expect(SyncPlan.plan(manifest, lock, { locked: true }).installRequests).toEqual([
      { commit: 'locked-a', source: 'repo' },
      { commit: 'pinned', source: 'repo' }
    ])
  })

  test('locked mode fails when lock entries are missing or mismatched', () => {
    const manifest = {
      schemaVersion: 1 as const,
      scope: 'global' as const,
      skills: [{ name: 'a', path: 'skills/a', ref: 'main', source: 'repo' }]
    }

    expect(() =>
      SyncPlan.plan({ ...manifest }, { schemaVersion: 1, scope: 'global', skills: {} }, { locked: true })
    ).toThrow('Missing locked skill')
    expect(() =>
      SyncPlan.plan(
        { ...manifest },
        {
          schemaVersion: 1,
          scope: 'global',
          skills: {
            a: {
              commit: 'abc',
              installedAt: '2026-04-25T00:00:00.000Z',
              installPath: '/tmp/a',
              method: 'copy',
              path: 'other',
              ref: 'main',
              source: 'repo'
            }
          }
        },
        { locked: true }
      )
    ).toThrow('does not match')
  })
})

describe('sync command', () => {
  test('dry-run prints one checkout for multiple skills sharing source and ref', async () => {
    const home = await writeManifestFixture()

    const output = await captureStdout(async () =>
      withHome(home, async () => {
        await syncCommand({ options: { dryRun: true, global: true } })
      })
    )

    expect(output).toBe(`checkout repo at ref main
install a to ~/.agents/skills
install b to ~/.agents/skills
`)
  })

  test('sync prunes stale lock entries and writes resolved commits', async () => {
    const { commit, cwd } = await writeProjectManifestFixture()

    await withCwd(cwd, () => syncCommand({ options: {} }))

    const lock = await readProjectLock(cwd)
    expect(lock.skills.a.commit).toBe(commit)
    expect(lock.skills.b.commit).toBe(commit)
    expect(lock.skills.old).toBeUndefined()
  })
})

async function writeManifestFixture(): Promise<string> {
  const home = await tempDir('skills-sync-dry-run-')
  await writeGlobalManifest(home, {
    schemaVersion: 1,
    scope: 'global',
    skills: [
      { name: 'b', path: 'skills/b', ref: 'main', source: 'repo' },
      { name: 'a', path: 'skills/a', ref: 'main', source: 'repo' }
    ]
  })
  return home
}

async function writeProjectManifestFixture(): Promise<{ commit: string; cwd: string }> {
  const cwd = await tempDir('skills-sync-run-')
  const { commit, source } = await createGitRepo()
  await writeProjectManifest(cwd, {
    schemaVersion: 1,
    scope: 'project',
    skills: [
      { name: 'b', path: 'skills/b', ref: 'main', source },
      { name: 'a', path: 'skills/a', ref: 'main', source }
    ]
  })
  await writeProjectLock(cwd, {
    schemaVersion: 1,
    scope: 'project',
    skills: {
      old: {
        commit: 'old',
        installedAt: '2026-04-24T00:00:00.000Z',
        installPath: `${cwd}/.agents/skills/old`,
        method: 'copy',
        source: 'repo'
      }
    }
  })
  return { commit, cwd }
}

async function createGitRepo(): Promise<{ commit: string; source: string }> {
  const source = await tempDir('skills-sync-source-')
  await $({ cwd: source, quiet: true })`git init -b main`
  await writeSkill(source, 'a')
  await writeSkill(source, 'b')
  await $({ cwd: source, quiet: true })`git add skills`
  await $({ cwd: source, quiet: true })`git -c user.email=skills@example.com -c user.name=Skills commit -m init`
  const commit = (await $({ cwd: source, quiet: true })`git rev-parse HEAD`).text().trim()
  return { commit, source }
}

async function readProjectLock(cwd: string): Promise<{ skills: Record<string, { commit: string }> }> {
  return JSON.parse(await Bun.file(join(cwd, '.agents', 'skills.lock.json')).text())
}

async function writeSkill(source: string, name: string): Promise<void> {
  const skillDir = join(source, 'skills', name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n`)
}
