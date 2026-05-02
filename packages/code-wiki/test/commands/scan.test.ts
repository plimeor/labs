import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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
    const logBefore = await readText(join(cwd, '.code-wiki', 'wiki', 'log.md'))

    await withCwd(cwd, () => scanCommand({ args: {} }))

    expect(await readText(join(cwd, '.code-wiki', 'wiki', 'log.md'))).toBe(logBefore)
  })

  test('applies project include and exclude filters to generated wiki content', async () => {
    const repoRoot = await tempDir('code-wiki-scan-filter-repo-')
    const wikiRoot = await tempDir('code-wiki-scan-filter-wiki-')
    await mkdir(join(repoRoot, 'src'), { recursive: true })
    await mkdir(join(repoRoot, 'docs'), { recursive: true })
    await writeFile(join(repoRoot, 'src', 'keep.ts'), 'export function KeepSymbol() { return true }\n')
    await writeFile(join(repoRoot, 'src', 'skip.ts'), 'export function SkipSymbol() { return false }\n')
    await writeFile(join(repoRoot, 'docs', 'guide.md'), '# Guide\n')

    const result = await scanRepository({
      branch: 'main',
      commit: 'abc123',
      project: {
        defaultBranch: 'HEAD',
        displayName: 'Filtered App',
        exclude: ['src/skip.ts'],
        id: 'filtered-app',
        include: ['src/**'],
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
    expect(modulePage).not.toContain('SkipSymbol')
    expect(await readText(join(wikiRoot, 'overview.md'))).toContain('Indexed source files: 1')
  })

  test('uses the configured shared project default branch when scanning managed clones', async () => {
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
              defaultBranch: 'release',
              displayName: 'app',
              id: 'app',
              managedRepoPath: join('.code-wiki', 'repos', 'app'),
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
      projectId: 'app'
    })
  })
})
