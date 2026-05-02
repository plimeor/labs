import { join, relative } from 'node:path'

import { groupBy, uniq } from 'es-toolkit/array'
import * as v from 'valibot'

import { Files } from '../files.js'
import { isRecord } from '../json.js'
import { isHumanAuthority, markdownList, readAuthority, renderGeneratedPage, slugify } from '../markdown/pages.js'
import type {
  ProjectEntry,
  ProjectMetadata,
  WikiIndexDocument,
  WikiIndexPage,
  WikiPageAuthority,
  WikiPageKind
} from '../types.js'
import { ProjectMetadataSchema } from '../types.js'

export type ScanTarget = {
  branch: string
  commit: string
  project: ProjectEntry
  repoRoot: string
  wikiRoot: string
}

export type ScanResult = {
  index: WikiIndexDocument
  metadata: ProjectMetadata
  preservedPages: string[]
}

type SourceFile = {
  path: string
  symbols: string[]
}

type PageSpec = {
  body: string
  dependsOn?: string[]
  id: string
  kind: WikiPageKind
  path: string
  sourceRefs: string[]
  summary: string
  symbols: string[]
  title: string
}

const ignoredDirectories = new Set([
  '.code-wiki',
  '.git',
  '.next',
  '.turbo',
  '.vitepress',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out'
])

const ignoredFiles = new Set([
  'bun.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'skills.lock.json',
  'tsconfig.tsbuildinfo'
])

const sourceExtensions = new Set([
  '.c',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.kt',
  '.md',
  '.mdx',
  '.mjs',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.svelte',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.vue',
  '.yaml',
  '.yml'
])

export async function readMetadata(path: string): Promise<ProjectMetadata | undefined> {
  try {
    return await Files.readJson(path, input => v.parse(ProjectMetadataSchema, input))
  } catch (error) {
    if (Files.isNotFound(error)) {
      return undefined
    }

    throw error
  }
}

export async function scanRepository(target: ScanTarget): Promise<ScanResult> {
  const scanTime = new Date().toISOString()
  const sourceFiles = await collectSourceFiles(target.repoRoot, {
    exclude: target.project.exclude,
    include: target.project.include
  })
  const pageSpecs = await buildPageSpecs(target, sourceFiles, scanTime)
  const preservedPages: string[] = []

  await Files.ensureDir(target.wikiRoot)
  await Files.ensureDir(join(target.wikiRoot, 'modules'))
  await Files.ensureDir(join(target.wikiRoot, 'contracts'))
  await Files.ensureDir(join(target.wikiRoot, 'flows'))

  const pages: WikiIndexPage[] = []
  for (const spec of pageSpecs) {
    const page = await writePage(target, spec, scanTime)
    if (page.authority !== 'generated') {
      preservedPages.push(spec.path)
    }
    pages.push(page)
  }

  const indexDocument: WikiIndexDocument = {
    commit: target.commit,
    pages: pages.sort((a, b) => a.id.localeCompare(b.id)),
    projectId: target.project.id,
    schemaVersion: 1
  }
  const metadata: ProjectMetadata = {
    branch: target.branch,
    exclude: target.project.exclude,
    include: target.project.include,
    lastScannedAt: scanTime,
    lastScannedCommit: target.commit,
    projectId: target.project.id,
    repoUrl: target.project.repoUrl,
    schemaVersion: 1
  }

  await Files.writeJson(join(target.wikiRoot, 'index.json'), indexDocument)
  await Files.writeJson(join(target.wikiRoot, 'metadata.json'), metadata)
  await appendScanLog(target.wikiRoot, target, preservedPages, scanTime)

  return {
    index: indexDocument,
    metadata,
    preservedPages
  }
}

async function buildPageSpecs(target: ScanTarget, sourceFiles: SourceFile[], scanTime: string): Promise<PageSpec[]> {
  const moduleSpecs = buildModulePages(target.project.id, sourceFiles)
  const contractSpecs = await buildContractPages(target, sourceFiles)
  const overviewSpec = buildOverviewPage(target, sourceFiles, moduleSpecs, contractSpecs)
  const indexSpec = buildHumanIndexPage(target, [...moduleSpecs, ...contractSpecs], scanTime)

  return [overviewSpec, indexSpec, ...moduleSpecs, ...contractSpecs].sort((a, b) => a.id.localeCompare(b.id))
}

function buildOverviewPage(
  target: ScanTarget,
  sourceFiles: SourceFile[],
  moduleSpecs: PageSpec[],
  contractSpecs: PageSpec[]
): PageSpec {
  const entryPoints = sourceFiles
    .map(file => file.path)
    .filter(path =>
      /(^|\/)(README\.md|package\.json|src\/.*\.(ts|tsx|js|jsx)|main\.(ts|js)|index\.(ts|js))$/i.test(path)
    )
    .slice(0, 20)
  const moduleLines = moduleSpecs.map(module => `${module.id}: ${module.summary}`)
  const contractLines = contractSpecs.map(contract => `${contract.id}: ${contract.summary}`)
  const body = [
    `# ${target.project.displayName}`,
    '',
    '## Observed Repository Facts',
    '',
    markdownList([
      `Project id: ${target.project.id}`,
      `Repository source: ${target.project.repoUrl}`,
      `Scanned commit: ${target.commit}`,
      `Scanned branch: ${target.branch}`,
      `Indexed source files: ${sourceFiles.length}`
    ]),
    '',
    '## Entry Points',
    '',
    markdownList(entryPoints),
    '',
    '## Major Subsystems',
    '',
    markdownList(moduleLines),
    '',
    '## Durable Contracts',
    '',
    markdownList(contractLines),
    ''
  ].join('\n')

  return {
    body,
    id: 'overview',
    kind: 'overview',
    path: 'overview.md',
    sourceRefs: ['**/*'],
    summary: 'Project purpose, boundaries, entry points, and major subsystems.',
    symbols: [],
    title: `${target.project.displayName} Overview`
  }
}

function buildHumanIndexPage(target: ScanTarget, pages: PageSpec[], scanTime: string): PageSpec {
  const pageLines = pages.map(page => `- ${page.id} -> \`${page.path}\`: ${page.summary}`)
  const body = [
    `# ${target.project.displayName} Routing Index`,
    '',
    'Use this index before loading page bodies. Prefer focused module and contract pages over the whole wiki.',
    '',
    `Last generated: ${scanTime}`,
    '',
    '## Pages',
    '',
    markdownList(pageLines),
    ''
  ].join('\n')

  return {
    body,
    id: 'index',
    kind: 'index',
    path: 'index.md',
    sourceRefs: ['.code-wiki/index.json'],
    summary: 'Human-readable routing index for review context selection.',
    symbols: [],
    title: `${target.project.displayName} Routing Index`
  }
}

function buildModulePages(projectId: string, sourceFiles: SourceFile[]): PageSpec[] {
  const groups = groupBy(sourceFiles, file => moduleGroup(file.path))

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, files]) => {
      const symbols = uniq(files.flatMap(file => file.symbols))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 40)
      const keyFiles = files
        .map(file => file.path)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 40)
      const id = `module.${logicalId(group)}`
      const sourceRefs = group === 'root' ? keyFiles : [`${group}/**`]
      const title = `${titleize(group)} Module`
      const body = [
        `# ${title}`,
        '',
        '## Responsibility',
        '',
        `Generated summary for \`${projectId}\` files under \`${group}\`. Treat this as routing context, not final human design truth.`,
        '',
        '## Key Files',
        '',
        markdownList(keyFiles),
        '',
        '## Notable Symbols',
        '',
        markdownList(symbols),
        '',
        '## Common Change Points',
        '',
        markdownList(keyFiles.slice(0, 12).map(path => `\`${path}\``)),
        '',
        '## Regression Hints',
        '',
        markdownList([
          'Check imports and callers of the notable symbols before changing this module.',
          'Review adjacent module pages and contract pages when changes cross package or API boundaries.'
        ]),
        ''
      ].join('\n')

      return {
        body,
        id,
        kind: 'module',
        path: group === 'root' ? 'modules/root.md' : `modules/${group}.md`,
        sourceRefs,
        summary: `Files and symbols under ${group}.`,
        symbols,
        title
      }
    })
}

async function buildContractPages(target: ScanTarget, sourceFiles: SourceFile[]): Promise<PageSpec[]> {
  const pages: PageSpec[] = []
  if (sourceFiles.some(file => file.path === 'package.json')) {
    pages.push(await buildPackageContract(target))
  }

  const routeFiles = sourceFiles
    .map(file => file.path)
    .filter(path => /(^|\/)(api|routes|pages|app)\//.test(path) && /\.(ts|tsx|js|jsx|py|rb|go)$/.test(path))
    .sort((a, b) => a.localeCompare(b))
  if (routeFiles.length > 0) {
    pages.push(buildRouteContract(target, routeFiles))
  }

  return pages
}

async function buildPackageContract(target: ScanTarget): Promise<PageSpec> {
  const packageJsonPath = join(target.repoRoot, 'package.json')
  const raw = await Files.readText(packageJsonPath)
  const packageJson = JSON.parse(raw) as Record<string, unknown>
  const scripts = isRecord(packageJson.scripts)
    ? Object.keys(packageJson.scripts).sort((a, b) => a.localeCompare(b))
    : []
  const dependencies = collectPackageDependencies(packageJson)
  const body = [
    '# Package Contract',
    '',
    '## Observed Facts',
    '',
    markdownList([
      `Package name: ${String(packageJson.name ?? target.project.id)}`,
      `Package type: ${String(packageJson.type ?? 'unspecified')}`,
      `Executable bins: ${formatPackageBins(packageJson.bin)}`
    ]),
    '',
    '## Scripts',
    '',
    markdownList(scripts.map(script => `\`${script}\``)),
    '',
    '## Dependency Surface',
    '',
    markdownList(dependencies.map(name => `\`${name}\``)),
    ''
  ].join('\n')

  return {
    body,
    id: 'contract.package',
    kind: 'contract',
    path: 'contracts/package.md',
    sourceRefs: ['package.json'],
    summary: 'Package metadata, scripts, bins, and dependency boundary.',
    symbols: [],
    title: 'Package Contract'
  }
}

function buildRouteContract(target: ScanTarget, routeFiles: string[]): PageSpec {
  const body = [
    '# Route Contract',
    '',
    '## Observed Route-Like Files',
    '',
    markdownList(routeFiles.map(path => `\`${path}\``)),
    '',
    '## Planning Notes',
    '',
    markdownList([
      `Review these files before changing route, request, response, or navigation behavior in ${target.project.id}.`,
      'Confirm runtime framework conventions in the owning module page before editing.'
    ]),
    ''
  ].join('\n')

  return {
    body,
    id: 'contract.routes',
    kind: 'contract',
    path: 'contracts/routes.md',
    sourceRefs: routeFiles,
    summary: 'Route-like files that may affect request, response, or navigation contracts.',
    symbols: [],
    title: 'Route Contract'
  }
}

async function writePage(target: ScanTarget, spec: PageSpec, scanTime: string): Promise<WikiIndexPage> {
  const absolutePath = join(target.wikiRoot, spec.path)
  const rendered = renderGeneratedPage({
    body: spec.body,
    generatedFromCommit: target.commit,
    id: spec.id,
    kind: spec.kind,
    lastVerifiedAt: scanTime,
    sourceRefs: spec.sourceRefs,
    symbols: spec.symbols,
    title: spec.title
  })

  let authority: WikiPageAuthority = 'generated'
  let contentHash = rendered.contentHash
  if (await Files.pathExists(absolutePath)) {
    const existing = await Files.readText(absolutePath)
    const existingAuthority = readAuthority(existing)
    if (isHumanAuthority(existingAuthority)) {
      authority = existingAuthority
      contentHash = readFrontmatterField(existing, 'contentHash') ?? rendered.contentHash
    } else {
      await Files.writeText(absolutePath, rendered.content)
    }
  } else {
    await Files.writeText(absolutePath, rendered.content)
  }

  return {
    authority,
    contentHash,
    dependsOn: spec.dependsOn,
    id: spec.id,
    kind: spec.kind,
    lastScannedCommit: target.commit,
    path: spec.path,
    sourceRefs: spec.sourceRefs,
    summary: spec.summary,
    symbols: spec.symbols,
    title: spec.title
  }
}

async function appendScanLog(
  wikiRoot: string,
  target: ScanTarget,
  preservedPages: string[],
  scanTime: string
): Promise<void> {
  const logPath = join(wikiRoot, 'log.md')
  const entry = [
    `## ${scanTime} scan`,
    '',
    `- Branch: ${target.branch}`,
    `- Commit: ${target.commit}`,
    `- Repository: ${target.project.repoUrl}`,
    preservedPages.length > 0
      ? `- Preserved human-authority pages: ${preservedPages.map(path => `\`${path}\``).join(', ')}`
      : '- Preserved human-authority pages: none',
    ''
  ].join('\n')
  const existing = (await Files.pathExists(logPath))
    ? await Files.readText(logPath)
    : `# ${target.project.displayName} Log\n\n`
  await Files.writeText(logPath, `${existing.trimEnd()}\n\n${entry}`)
}

async function collectSourceFiles(
  root: string,
  filters: {
    exclude?: string[]
    include?: string[]
  }
): Promise<SourceFile[]> {
  const paths = await walk(root)
  const files: SourceFile[] = []
  for (const path of paths.sort((a, b) => a.localeCompare(b))) {
    if (!isCandidateSource(path)) {
      continue
    }

    if (!isIncludedSource(path, filters)) {
      continue
    }

    files.push({
      path,
      symbols: await extractSymbols(join(root, path))
    })
  }

  return files
}

async function walk(root: string, current = root): Promise<string[]> {
  const entries = await Files.readDir(current)
  const paths: string[] = []
  for (const entry of entries) {
    const absolute = join(current, entry)
    const type = await pathType(absolute)
    if (type === 'directory' && ignoredDirectories.has(entry)) {
      continue
    }

    if (type === 'directory') {
      paths.push(...(await walk(root, absolute)))
      continue
    }

    if (type === 'file') {
      paths.push(toPosixPath(relative(root, absolute)))
    }
  }

  return paths
}

async function extractSymbols(path: string): Promise<string[]> {
  const stats = await Files.statPath(path)
  if (Number(stats.size) > 200_000) {
    return []
  }

  const text = await Files.readText(path).catch(() => '')
  const symbols = new Set<string>()
  for (const match of text.matchAll(
    /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/g
  )) {
    if (match[1]) {
      symbols.add(match[1])
    }
  }

  return [...symbols].sort((a, b) => a.localeCompare(b)).slice(0, 40)
}

async function pathType(path: string): Promise<'directory' | 'file' | 'other'> {
  try {
    await Files.readSymbolicLink(path)
    return 'other'
  } catch (error) {
    if (!Files.isNotFound(error) && !Files.isNotSymbolicLinkReadError(error)) {
      throw error
    }
  }

  const stats = await Files.statPath(path)
  if (stats.isDirectory()) {
    return 'directory'
  }

  if (stats.isFile()) {
    return 'file'
  }

  return 'other'
}

function isCandidateSource(path: string): boolean {
  const fileName = path.split('/').at(-1) ?? path
  if (ignoredFiles.has(fileName)) {
    return false
  }

  const extension = fileName.includes('.') ? `.${fileName.split('.').at(-1)}` : ''
  return sourceExtensions.has(extension) || fileName === 'README' || fileName === 'Dockerfile'
}

function isIncludedSource(path: string, filters: { exclude?: string[]; include?: string[] }): boolean {
  if (filters.include && filters.include.length > 0 && !matchesAnyPattern(path, filters.include)) {
    return false
  }

  return !matchesAnyPattern(path, filters.exclude ?? [])
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesPathPattern(path, pattern))
}

function matchesPathPattern(path: string, pattern: string): boolean {
  const normalizedPattern = toPosixPath(pattern)
    .replace(/^\.?\//, '')
    .replace(/\/$/, '')
  if (!normalizedPattern) {
    return false
  }

  if (!normalizedPattern.includes('*')) {
    return path === normalizedPattern || path.startsWith(`${normalizedPattern}/`)
  }

  return globToRegExp(normalizedPattern).test(path)
}

function globToRegExp(pattern: string): RegExp {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const next = pattern[index + 1]
    if (char === '*' && next === '*') {
      source += '.*'
      index += 1
      continue
    }

    if (char === '*') {
      source += '[^/]*'
      continue
    }

    source += escapeRegExp(char)
  }

  return new RegExp(`${source}$`)
}

function moduleGroup(path: string): string {
  const parts = path.split('/')
  if (parts.length === 1) {
    return 'root'
  }

  if ((parts[0] === 'packages' || parts[0] === 'apps') && parts[1]) {
    return `${parts[0]}/${parts[1]}`
  }

  return parts[0] ?? 'root'
}

function logicalId(group: string): string {
  return group.split('/').map(slugify).join('.')
}

function titleize(group: string): string {
  return group
    .split('/')
    .map(part => slugify(part).replace(/-/g, ' '))
    .map(part => part.replace(/\b\w/g, char => char.toUpperCase()))
    .join(' / ')
}

function collectPackageDependencies(packageJson: Record<string, unknown>): string[] {
  const keys = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  const names = new Set<string>()
  for (const key of keys) {
    const value = packageJson[key]
    if (isRecord(value)) {
      for (const name of Object.keys(value)) {
        names.add(name)
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b))
}

function formatPackageBins(bin: unknown): string {
  if (typeof bin === 'string') {
    return bin
  }

  if (isRecord(bin)) {
    return (
      Object.keys(bin)
        .sort((a, b) => a.localeCompare(b))
        .join(', ') || 'none'
    )
  }

  return 'none'
}

function readFrontmatterField(markdown: string, field: string): string | undefined {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/)
  return match?.[1]?.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))?.[1]?.trim()
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toPosixPath(path: string): string {
  return path.split('\\').join('/')
}
