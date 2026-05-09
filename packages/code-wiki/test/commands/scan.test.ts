import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { $ } from 'bun'

import { initCommand } from '../../src/commands/init'
import { scanCommand } from '../../src/commands/scan'
import { scanRepository } from '../../src/scanner/index'
import { readJson, readText, tempDir } from '../helpers/fs'
import { run, withCwd } from '../helpers/process'

describe('scan command', () => {
  test('honors repository gitignore rules when generating wiki content', async () => {
    const repoRoot = await tempDir('code-wiki-scan-filter-repo-')
    const wikiRoot = await tempDir('code-wiki-scan-filter-wiki-')
    await run('git', ['init', '-q', '-b', 'main'], repoRoot)
    await mkdir(join(repoRoot, 'src'), { recursive: true })
    await mkdir(join(repoRoot, 'docs'), { recursive: true })
    await mkdir(join(repoRoot, 'src', '__stories__'), { recursive: true })
    await writeFile(join(repoRoot, '.gitignore'), 'src/skip.ts\ndocs/\n')
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
        id: 'filtered-app',
        repo: 'git@example.com:org/filtered-app.git'
      },
      repoRoot,
      wikiRoot
    })

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
    await run('git', ['init', '-q', '-b', 'main'], repoRoot)
    await mkdir(join(repoRoot, 'docs'), { recursive: true })
    await writeFile(join(repoRoot, 'docs', 'theme.md'), 'tokens recipes theme aria server-components ReactFiber\n')

    await scanRepository({
      branch: 'main',
      commit: 'docs',
      ref: 'main',
      repoRoot,
      wikiRoot,
      project: {
        id: 'generic',
        repo: 'git@example.com:org/generic.git'
      }
    })

    const overview = await readText(join(wikiRoot, 'overview.md'))
    expect(overview).toContain('## Notable Symbols')
    expect(overview).not.toContain('## Detected Architecture Signals')
    expect(overview).not.toContain('Design system primitives')
    expect(overview).not.toContain('Fiber reconciler')
    expect(overview).not.toContain('Server Components and Flight')
  })

  test('generates structured source references and diagram artifacts for a snapshot', async () => {
    const repoRoot = await tempDir('code-wiki-scan-source-refs-repo-')
    const wikiRoot = await tempDir('code-wiki-scan-source-refs-wiki-')
    await run('git', ['init', '-q', '-b', 'main'], repoRoot)
    await mkdir(join(repoRoot, 'src'), { recursive: true })
    await mkdir(join(repoRoot, 'app', 'api', 'orders'), { recursive: true })
    await writeFile(
      join(repoRoot, 'package.json'),
      JSON.stringify(
        {
          files: ['src'],
          main: './src/index.ts',
          name: 'source-refs',
          type: 'module',
          exports: {
            '.': './src/index.ts'
          },
          scripts: {
            prepack: 'bun src/index.ts'
          }
        },
        null,
        2
      )
    )
    await writeFile(join(repoRoot, 'src', 'index.ts'), 'export function VisibleSymbol() { return 1 }\n')
    await writeFile(
      join(repoRoot, 'app', 'api', 'orders', 'route.ts'),
      'import { VisibleSymbol } from "../../../src/index"\nexport function GET() { return VisibleSymbol() }\n'
    )

    const result = await scanRepository({
      branch: 'main',
      commit: 'abcdef123456',
      ref: 'HEAD',
      project: {
        id: 'source-refs',
        repo: 'https://github.com/acme/source-refs.git'
      },
      repoRoot,
      wikiRoot
    })

    const index = await readJson(join(wikiRoot, 'index.json'))
    const srcPage = index.pages.find((page: { id: string }) => page.id === 'module.src')
    expect(srcPage?.sourceReferences).toContainEqual(
      expect.objectContaining({
        commit: 'abcdef123456',
        externalUrl: 'https://github.com/acme/source-refs/blob/abcdef123456/src/index.ts#L1',
        path: 'src/index.ts',
        projectId: 'source-refs',
        startLine: 1,
        symbolName: 'VisibleSymbol'
      })
    )
    expect(result.index.pages.map(page => page.id)).toContain('diagram.index')
    expect(await Bun.file(join(wikiRoot, 'diagrams', 'workspace-graph.mmd')).exists()).toBe(true)
    expect(await Bun.file(join(wikiRoot, 'diagrams', 'dependency-graph.json')).exists()).toBe(true)
    expect(await Bun.file(join(wikiRoot, 'diagrams', 'module-src.json')).exists()).toBe(true)
    expect(await Bun.file(join(wikiRoot, 'diagrams', 'route-graph.json')).exists()).toBe(true)
    const routeDiagram = await readJson(join(wikiRoot, 'diagrams', 'route-graph.json'))
    expect(routeDiagram).toMatchObject({
      commit: 'abcdef123456',
      kind: 'route'
    })
    expect(routeDiagram.edges).toContainEqual(
      expect.objectContaining({
        kind: 'routes_to',
        sourceRefs: [expect.objectContaining({ path: 'app/api/orders/route.ts' })]
      })
    )
    expect(await readText(join(wikiRoot, 'contracts', 'package.md'))).toContain('Exports: .')
    expect(await readText(join(wikiRoot, 'contracts', 'package.md'))).toContain('Entry points: main: ./src/index.ts')
  })

  test('models nonstandard monorepo workspaces and tsconfig dependency edges', async () => {
    const repoRoot = await tempDir('code-wiki-scan-monorepo-repo-')
    const wikiRoot = await tempDir('code-wiki-scan-monorepo-wiki-')
    await run('git', ['init', '-q', '-b', 'main'], repoRoot)
    await mkdir(join(repoRoot, 'tools', 'kit', 'src'), { recursive: true })
    await mkdir(join(repoRoot, 'services', 'web', 'src'), { recursive: true })
    await writeFile(join(repoRoot, 'package.json'), JSON.stringify({ name: 'root', private: true }, null, 2))
    await writeFile(join(repoRoot, 'pnpm-workspace.yaml'), 'packages:\n  - tools/*\n  - services/*\n')
    await writeFile(join(repoRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    await writeFile(
      join(repoRoot, 'tools', 'kit', 'package.json'),
      JSON.stringify(
        {
          files: ['src'],
          name: '@acme/kit',
          types: './src/index.ts',
          scripts: {
            prepack: 'bun src/index.ts'
          }
        },
        null,
        2
      )
    )
    await writeFile(join(repoRoot, 'tools', 'kit', 'src', 'index.ts'), 'export function KitTool() { return 1 }\n')
    await writeFile(
      join(repoRoot, 'services', 'web', 'package.json'),
      JSON.stringify(
        {
          name: 'web',
          dependencies: {
            '@acme/kit': 'workspace:*'
          }
        },
        null,
        2
      )
    )
    await writeFile(
      join(repoRoot, 'services', 'web', 'tsconfig.json'),
      JSON.stringify({ references: [{ path: '../../tools/kit' }] }, null, 2)
    )
    await writeFile(
      join(repoRoot, 'services', 'web', 'src', 'index.ts'),
      'import { KitTool } from "@acme/kit"\nexport function WebApp() { return KitTool() }\n'
    )

    await scanRepository({
      branch: 'main',
      commit: 'monocommit',
      ref: 'HEAD',
      project: {
        id: 'mono',
        repo: 'git@example.com:org/mono.git'
      },
      repoRoot,
      wikiRoot
    })

    const index = await readJson(join(wikiRoot, 'index.json'))
    expect(index.pages.map((page: { id: string }) => page.id)).toEqual(
      expect.arrayContaining(['contract.workspace', 'module.services.web', 'module.tools.kit'])
    )
    const workspace = await readText(join(wikiRoot, 'contracts', 'workspace.md'))
    expect(workspace).toContain('`pnpm-lock.yaml`')
    expect(workspace).toContain('services.web -> tools.kit, package edge observed in `services/web/package.json`')
    expect(workspace).toContain('services.web -> tools.kit, tsconfig edge observed in `services/web/tsconfig.json`')
    const workspaceDiagram = await readJson(join(wikiRoot, 'diagrams', 'workspace-graph.json'))
    expect(workspaceDiagram.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'depends_on',
          sourceRefs: [expect.objectContaining({ path: 'services/web/package.json' })]
        }),
        expect.objectContaining({
          kind: 'depends_on',
          sourceRefs: [expect.objectContaining({ path: 'services/web/tsconfig.json' })]
        })
      ])
    )
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
      await initCommand()
    })
    await writeFile(
      join(cwd, '.code-wiki', 'projects.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          projects: [
            {
              id: 'app',
              ref: 'release',
              repo: `file://${remote}`
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

    const metadata = await readText(join(cwd, '.code-wiki', 'projects', 'app', 'metadata.json'))
    const log = await readText(join(cwd, '.code-wiki', 'projects', 'app', 'log.md'))
    await withCwd(cwd, () => scanCommand({ args: { project: 'app' } }))
    expect(await readText(join(cwd, '.code-wiki', 'projects', 'app', 'metadata.json'))).toBe(metadata)
    expect(await readText(join(cwd, '.code-wiki', 'projects', 'app', 'log.md'))).toBe(log)
  })

  test('resolves a configured commit ref before scanning a managed clone', async () => {
    const remote = await tempDir('code-wiki-scan-commit-remote-')
    await run('git', ['init', '-q', '-b', 'main'], remote)
    await mkdir(join(remote, 'src'), { recursive: true })
    await writeFile(join(remote, 'src', 'index.ts'), 'export function LegacySymbol() { return "legacy" }\n')
    await run('git', ['add', '.'], remote)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'legacy'], remote)
    const legacyCommit = await $`printf "%s" "$(git rev-parse HEAD)"`.cwd(remote).quiet().text()
    await writeFile(join(remote, 'src', 'index.ts'), 'export function ModernSymbol() { return "modern" }\n')
    await run('git', ['add', '.'], remote)
    await run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'modern'], remote)

    const cwd = await tempDir('code-wiki-scan-commit-workspace-')
    await run('git', ['init', '-q', '-b', 'main'], cwd)
    await withCwd(cwd, async () => {
      await initCommand()
    })
    await writeFile(
      join(cwd, '.code-wiki', 'projects.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          projects: [
            {
              id: 'app',
              ref: legacyCommit,
              repo: `file://${remote}`
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
    await run('git', ['init', '-q', '-b', 'main'], repoRoot)
    await mkdir(join(repoRoot, 'src', 'legacy'), { recursive: true })
    await writeFile(join(repoRoot, 'src', 'legacy', 'stack.ts'), 'export function ReactMount() { return null }\n')
    await scanRepository({
      branch: 'main',
      commit: 'react15',
      ref: 'v15.6.2',
      project: {
        id: 'react',
        ref: 'v15.6.2',
        repo: 'https://github.com/facebook/react.git'
      },
      repoRoot,
      wikiRoot
    })
    await writeFile(join(wikiRoot, 'versions.json'), '{"stale":true}\n')
    await mkdir(join(wikiRoot, 'versions', 'react15'), { recursive: true })
    await writeFile(join(wikiRoot, 'versions', 'react15', 'overview.md'), '# stale\n')
    await writeFile(join(wikiRoot, 'obsolete.md'), '# stale\n')

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
        id: 'react',
        ref: 'v16.14.0',
        repo: 'https://github.com/facebook/react.git'
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
    expect(await Bun.file(join(wikiRoot, 'versions.json')).exists()).toBe(false)
    expect(await Bun.file(join(wikiRoot, 'versions', 'react15', 'overview.md')).exists()).toBe(false)
    expect(await Bun.file(join(wikiRoot, 'obsolete.md')).exists()).toBe(false)
  })
})
