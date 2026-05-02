import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { $ } from 'zx'

import { initCommand } from '../../src/commands/init.js'
import { scanCommand } from '../../src/commands/scan.js'
import { scanRepository } from '../../src/scanner/index.js'
import { readJson, readText, tempDir } from '../helpers/fs.js'
import { run, withCwd } from '../helpers/process.js'

describe('scan command', () => {
  test('scans an embedded repository into a routable wiki and skips unchanged commits', async () => {
    const cwd = await tempDir('code-wiki-scan-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)
    await mkdir(join(cwd, 'src'), { recursive: true })
    await writeFile(join(cwd, 'package.json'), '{"name":"scan-app","type":"module"}\n')
    await writeFile(join(cwd, 'src', 'index.ts'), 'export function BillingPage() { return "billing" }\n')
    await run('git', ['add', '.'], cwd)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'init'], cwd)

    await withCwd(cwd, async () => {
      await initCommand({ options: {} })
      await scanCommand({ args: {} })
    })

    const index = (await readJson(join(cwd, '.code-wiki', 'wiki', 'index.json'))) as {
      projectId: string
      schemaVersion: number
    }
    expect(index.projectId).toStartWith('code-wiki-scan-')
    expect(index.schemaVersion).toBe(1)
    expect(JSON.stringify(index)).toContain('module.src')
    expect(JSON.stringify(index)).toContain('contract.package')
    expect(await readText(join(cwd, '.code-wiki', 'wiki', 'modules', 'src.md'))).toContain(
      'symbols:\n  - "BillingPage"'
    )
    const agents = await readText(join(cwd, '.code-wiki', 'wiki', 'AGENTS.md'))
    expect(agents).toContain('Read `index.json` first')
    expect(agents).toContain('Do not edit generated wiki files directly')
    expect(existsSync(join(cwd, '.code-wiki', 'wiki', 'versions.json'))).toBe(false)
    expect(existsSync(join(cwd, '.code-wiki', 'wiki', 'versions'))).toBe(false)
    const logBefore = await readText(join(cwd, '.code-wiki', 'wiki', 'log.md'))

    await withCwd(cwd, () => scanCommand({ args: {} }))

    expect(await readText(join(cwd, '.code-wiki', 'wiki', 'log.md'))).toBe(logBefore)

    await rm(join(cwd, '.code-wiki', 'wiki', 'AGENTS.md'))
    await writeFile(join(cwd, '.code-wiki', 'wiki', 'versions.json'), '{"legacy":true}\n')
    await mkdir(join(cwd, '.code-wiki', 'wiki', 'versions', 'old'), { recursive: true })

    await withCwd(cwd, () => scanCommand({ args: {} }))

    expect(await readText(join(cwd, '.code-wiki', 'wiki', 'AGENTS.md'))).toContain('CodeWiki Reading Protocol')
    expect(existsSync(join(cwd, '.code-wiki', 'wiki', 'versions.json'))).toBe(false)
    expect(existsSync(join(cwd, '.code-wiki', 'wiki', 'versions'))).toBe(false)
  })

  test('applies project include and exclude filters to generated wiki content', async () => {
    const repoRoot = await tempDir('code-wiki-scan-filter-repo-')
    const wikiRoot = await tempDir('code-wiki-scan-filter-wiki-')
    await mkdir(join(repoRoot, 'src'), { recursive: true })
    await mkdir(join(repoRoot, 'docs'), { recursive: true })
    await mkdir(join(repoRoot, 'src', '__stories__'), { recursive: true })
    await writeFile(join(repoRoot, 'src', 'keep.ts'), 'const a = 1\nexport function KeepSymbol() { return a }\n')
    await writeFile(join(repoRoot, 'src', 'skip.ts'), 'export function SkipSymbol() { return false }\n')
    await writeFile(
      join(repoRoot, 'src', '__stories__', 'keep.stories.tsx'),
      'export function StoryOnlySymbol() { return null }\n'
    )
    await writeFile(join(repoRoot, 'docs', 'guide.md'), '# Guide\n')

    const result = await scanRepository({
      branch: 'main',
      commit: 'abc123',
      ref: 'HEAD',
      project: {
        displayName: 'Filtered App',
        exclude: ['src/skip.ts'],
        id: 'filtered-app',
        include: ['src/**'],
        ref: 'HEAD',
        repoUrl: 'git@example.com:org/filtered-app.git',
        wikiPath: '.code-wiki/projects/filtered-app'
      },
      repoRoot,
      wikiRoot
    })

    expect(result.metadata.include).toEqual(['src/**'])
    expect(result.metadata.exclude).toEqual(['src/skip.ts'])
    expect(result.index.pages.map(page => page.id)).toContain('module.src')
    const modulePage = await readText(join(wikiRoot, 'modules', 'src.md'))
    expect(modulePage).toContain('KeepSymbol')
    expect(modulePage).not.toContain('- a')
    expect(modulePage).not.toContain('SkipSymbol')
    expect(modulePage).not.toContain('StoryOnlySymbol')
    expect(await readText(join(wikiRoot, 'overview.md'))).toContain('Indexed source files: 1')
  })

  test('does not emit framework-specific architecture signals from scanner presets', async () => {
    const repoRoot = await tempDir('code-wiki-scan-generic-signals-')
    const wikiRoot = await tempDir('code-wiki-scan-generic-signals-wiki-')
    await mkdir(join(repoRoot, 'docs'), { recursive: true })
    await writeFile(join(repoRoot, 'docs', 'theme.md'), 'tokens recipes theme aria server-components ReactFiber\n')

    await scanRepository({
      branch: 'main',
      commit: 'docs',
      ref: 'main',
      repoRoot,
      wikiRoot,
      project: {
        displayName: 'Generic',
        id: 'generic',
        ref: 'main',
        repoUrl: 'git@example.com:org/generic.git',
        wikiPath: '.code-wiki/projects/generic'
      }
    })

    const overview = await readText(join(wikiRoot, 'overview.md'))
    expect(overview).toContain('## Notable Symbols')
    expect(overview).not.toContain('## Detected Architecture Signals')
    expect(overview).not.toContain('Design system primitives')
    expect(overview).not.toContain('Fiber reconciler')
    expect(overview).not.toContain('Server Components and Flight')
  })

  test('uses the configured shared project ref when scanning managed clones', async () => {
    const remote = await tempDir('code-wiki-scan-remote-')
    await run('git', ['init', '-q', '-b', 'main'], remote)
    await mkdir(join(remote, 'src'), { recursive: true })
    await writeFile(join(remote, 'src', 'index.ts'), 'export function MainSymbol() { return "main" }\n')
    await run('git', ['add', '.'], remote)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'main'], remote)
    await run('git', ['checkout', '-qb', 'release'], remote)
    await writeFile(join(remote, 'src', 'index.ts'), 'export function ReleaseSymbol() { return "release" }\n')
    await run('git', ['add', '.'], remote)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'release'], remote)

    const cwd = await tempDir('code-wiki-scan-shared-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)
    await withCwd(cwd, async () => {
      await initCommand({ options: { shared: true } })
    })
    await writeFile(
      join(cwd, '.code-wiki', 'projects.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          projects: [
            {
              displayName: 'app',
              id: 'app',
              managedRepoPath: join('.code-wiki', 'repos', 'app'),
              ref: 'release',
              repoUrl: remote,
              wikiPath: join('.code-wiki', 'projects', 'app')
            }
          ]
        },
        null,
        2
      )
    )

    await withCwd(cwd, () => scanCommand({ args: {} }))

    expect(await readText(join(cwd, '.code-wiki', 'projects', 'app', 'modules', 'src.md'))).toContain('ReleaseSymbol')
    expect(await readText(join(cwd, '.code-wiki', 'projects', 'app', 'modules', 'src.md'))).not.toContain('MainSymbol')
    expect(await readJson(join(cwd, '.code-wiki', 'projects', 'app', 'metadata.json'))).toMatchObject({
      branch: 'release',
      projectId: 'app',
      ref: 'release'
    })
    expect(await readText(join(cwd, '.code-wiki', 'projects', 'app', 'AGENTS.md'))).toContain(
      'CodeWiki Reading Protocol'
    )
    expect(existsSync(join(cwd, '.code-wiki', 'projects', 'app', 'versions.json'))).toBe(false)
    expect(existsSync(join(cwd, '.code-wiki', 'projects', 'app', 'versions'))).toBe(false)
  })

  test('resolves a configured commit ref before scanning a managed clone', async () => {
    const remote = await tempDir('code-wiki-scan-commit-remote-')
    await run('git', ['init', '-q', '-b', 'main'], remote)
    await mkdir(join(remote, 'src'), { recursive: true })
    await writeFile(join(remote, 'src', 'index.ts'), 'export function LegacySymbol() { return "legacy" }\n')
    await run('git', ['add', '.'], remote)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'legacy'], remote)
    const legacyCommit = (await $({ cwd: remote, quiet: true })`git rev-parse HEAD`).stdout.trim()
    await writeFile(join(remote, 'src', 'index.ts'), 'export function ModernSymbol() { return "modern" }\n')
    await run('git', ['add', '.'], remote)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'modern'], remote)

    const cwd = await tempDir('code-wiki-scan-commit-workspace-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)
    await withCwd(cwd, async () => {
      await initCommand({ options: { shared: true } })
    })
    await writeFile(
      join(cwd, '.code-wiki', 'projects.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          projects: [
            {
              displayName: 'app',
              id: 'app',
              managedRepoPath: join('.code-wiki', 'repos', 'app'),
              ref: legacyCommit,
              repoUrl: remote,
              wikiPath: join('.code-wiki', 'projects', 'app')
            }
          ]
        },
        null,
        2
      )
    )

    await withCwd(cwd, () => scanCommand({ args: {} }))

    const modulePage = await readText(join(cwd, '.code-wiki', 'projects', 'app', 'modules', 'src.md'))
    expect(modulePage).toContain('LegacySymbol')
    expect(modulePage).not.toContain('ModernSymbol')
    expect(await readJson(join(cwd, '.code-wiki', 'projects', 'app', 'metadata.json'))).toMatchObject({
      lastScannedCommit: legacyCommit,
      ref: legacyCommit
    })
  })

  test('removes stale generated pages when scanning a different ref', async () => {
    const repoRoot = await tempDir('code-wiki-scan-stale-repo-')
    const wikiRoot = await tempDir('code-wiki-scan-stale-wiki-')
    await mkdir(join(repoRoot, 'src', 'legacy'), { recursive: true })
    await writeFile(join(repoRoot, 'src', 'legacy', 'stack.ts'), 'export function ReactMount() { return null }\n')
    await scanRepository({
      branch: 'main',
      commit: 'react15',
      ref: 'v15.6.2',
      project: {
        displayName: 'React',
        id: 'react',
        ref: 'v15.6.2',
        repoUrl: 'https://github.com/facebook/react.git',
        wikiPath: '.code-wiki/projects/react'
      },
      repoRoot,
      wikiRoot
    })

    await Bun.write(join(repoRoot, 'src', 'legacy', 'stack.ts'), '')
    await mkdir(join(repoRoot, 'packages', 'react-reconciler'), { recursive: true })
    await writeFile(
      join(repoRoot, 'packages', 'react-reconciler', 'ReactFiberWorkLoop.ts'),
      'export function createFiber() { return null }\n'
    )
    await scanRepository({
      branch: 'main',
      commit: 'react16',
      ref: 'v16.14.0',
      project: {
        displayName: 'React',
        id: 'react',
        ref: 'v16.14.0',
        repoUrl: 'https://github.com/facebook/react.git',
        wikiPath: '.code-wiki/projects/react'
      },
      repoRoot,
      wikiRoot
    })

    const overview = await readText(join(wikiRoot, 'overview.md'))
    expect(overview).toContain('createFiber')
    expect(overview).not.toContain('ReactMount')
    expect(await readText(join(wikiRoot, 'modules', 'packages', 'react-reconciler.md'))).toContain(
      'ReactFiberWorkLoop.ts'
    )
    expect(existsSync(join(wikiRoot, 'versions.json'))).toBe(false)
    expect(existsSync(join(wikiRoot, 'versions'))).toBe(false)
  })
})
