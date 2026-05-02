import { join, relative } from 'node:path'

import { groupBy, uniq } from 'es-toolkit/array'
import * as v from 'valibot'

import { Files } from '../files.js'
import { isRecord } from '../json.js'
import { markdownList, renderGeneratedPage, slugify } from '../markdown/pages.js'
import type { ProjectEntry, ProjectMetadata, WikiIndexDocument, WikiIndexPage, WikiPageKind } from '../types.js'
import { ProjectMetadataSchema } from '../types.js'

export type ScanTarget = {
  branch: string
  commit: string
  project: ProjectEntry
  ref: string
  repoRoot: string
  wikiRoot: string
}

export type ScanResult = {
  index: WikiIndexDocument
  metadata: ProjectMetadata
}

type SourceFile = {
  extension: string
  imports: string[]
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
  '__fixtures__',
  '__stories__',
  '__tests__',
  'build',
  'coverage',
  'cypress',
  'dist',
  'e2e',
  'examples',
  'fixtures',
  'node_modules',
  'old_major_packages',
  'out',
  'stories',
  'test',
  'tests'
])

const ignoredFiles = new Set([
  'bun.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'skills.lock.json',
  'tsconfig.tsbuildinfo'
])

const ignoredFilePatterns = [/\.stories\.[cm]?[jt]sx?$/i, /\.story\.[cm]?[jt]sx?$/i]

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
  const metadata: ProjectMetadata = {
    branch: target.branch,
    exclude: target.project.exclude,
    include: target.project.include,
    lastScannedAt: scanTime,
    lastScannedCommit: target.commit,
    projectId: target.project.id,
    ref: target.ref,
    repoUrl: target.project.repoUrl,
    schemaVersion: 1
  }

  const indexDocument = await writeWikiArtifact(target.wikiRoot, target, pageSpecs, metadata, scanTime)
  await appendScanLog(target.wikiRoot, target, scanTime)

  return {
    index: indexDocument,
    metadata
  }
}

async function writeWikiArtifact(
  wikiRoot: string,
  target: ScanTarget,
  pageSpecs: PageSpec[],
  metadata: ProjectMetadata,
  scanTime: string
): Promise<WikiIndexDocument> {
  await prepareWikiRoot(wikiRoot)

  const pages: WikiIndexPage[] = []
  for (const spec of pageSpecs) {
    const page = await writePage(wikiRoot, target, spec, scanTime)
    pages.push(page)
  }

  const indexDocument: WikiIndexDocument = {
    commit: target.commit,
    pages: pages.sort((a, b) => a.id.localeCompare(b.id)),
    projectId: target.project.id,
    schemaVersion: 1
  }

  await Files.writeJson(join(wikiRoot, 'index.json'), indexDocument)
  await Files.writeJson(join(wikiRoot, 'metadata.json'), metadata)
  await writeAgentsFile(wikiRoot)

  return indexDocument
}

async function prepareWikiRoot(wikiRoot: string): Promise<void> {
  await Files.ensureDir(wikiRoot)
  for (const path of ['modules', 'contracts']) {
    await Files.removePath(join(wikiRoot, path), { force: true, recursive: true })
    await Files.ensureDir(join(wikiRoot, path))
  }
}

async function writeAgentsFile(wikiRoot: string): Promise<void> {
  await Files.writeText(
    join(wikiRoot, 'AGENTS.md'),
    [
      '# CodeWiki Reading Protocol',
      '',
      '1. Read `index.json` first to inspect available pages and source refs.',
      '2. Read `overview.md` for the broad repository shape.',
      '3. Read `index.md` for the human routing index.',
      '4. Open only the relevant `modules/` or `contracts/` pages for the task.',
      '',
      '- Cite wiki page paths and their `sourceRefs` when using this wiki as evidence.',
      '- If evidence is insufficient, state exactly what source or diff is missing.',
      '- For code review, treat the wiki only as baseline context. Inspect the real diff and source before judging a defect.',
      '- Do not edit generated wiki files directly; regenerate them with `code-wiki scan`.',
      ''
    ].join('\n')
  )
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
    .sort((a, b) => entryPointRank(a) - entryPointRank(b) || a.localeCompare(b))
    .slice(0, 20)
  const moduleLines = moduleSpecs.map(module => `${module.id}: ${module.summary}`)
  const contractLines = contractSpecs.map(contract => `${contract.id}: ${contract.summary}`)
  const symbolLines = uniq(sourceFiles.flatMap(file => file.symbols))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 40)
  const extensionLines = Object.entries(groupBy(sourceFiles, file => file.extension || 'none'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([extension, files]) => `${extension}: ${files.length}`)
  const body = [
    `# ${target.project.displayName}`,
    '',
    '## Observed Repository Facts',
    '',
    markdownList([
      `Project id: ${target.project.id}`,
      `Repository source: ${target.project.repoUrl}`,
      `Configured ref: ${target.ref}`,
      `Scanned commit: ${target.commit}`,
      `Scanned branch: ${target.branch}`,
      `Indexed source files: ${sourceFiles.length}`
    ]),
    '',
    '## Source Shape',
    '',
    markdownList(extensionLines),
    '',
    '## Notable Symbols',
    '',
    markdownList(symbolLines),
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
  const pageLines = pages.map(page => `${page.id} -> \`${page.path}\`: ${page.summary}`)
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
    summary: 'Human-readable routing index for selecting focused wiki pages.',
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
      const entryFiles = files
        .map(file => file.path)
        .filter(isLikelyEntryPoint)
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 20)
      const internalImports = uniq(
        files.flatMap(file => file.imports).filter(value => value.startsWith('.') || value.startsWith('#'))
      )
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 30)
      const externalImports = uniq(
        files.flatMap(file => file.imports).filter(value => !value.startsWith('.') && !value.startsWith('#'))
      )
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 30)
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
        '## Source Shape',
        '',
        markdownList([
          `Indexed files: ${files.length}`,
          `Extensions: ${formatExtensionCounts(files)}`,
          `Source refs: ${sourceRefs.map(ref => `\`${ref}\``).join(', ')}`
        ]),
        '',
        '## Entry Files',
        '',
        markdownList(entryFiles.map(path => `\`${path}\``)),
        '',
        '## Key Files',
        '',
        markdownList(keyFiles),
        '',
        '## Notable Symbols',
        '',
        markdownList(symbols),
        '',
        '## Dependency Hints',
        '',
        markdownList([
          `Internal imports: ${internalImports.length > 0 ? internalImports.map(value => `\`${value}\``).join(', ') : 'None observed.'}`,
          `External imports: ${externalImports.length > 0 ? externalImports.map(value => `\`${value}\``).join(', ') : 'None observed.'}`
        ]),
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

async function writePage(
  wikiRoot: string,
  target: ScanTarget,
  spec: PageSpec,
  scanTime: string
): Promise<WikiIndexPage> {
  const absolutePath = join(wikiRoot, spec.path)
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

  await Files.writeText(absolutePath, rendered.content)

  return {
    authority: 'generated',
    contentHash: rendered.contentHash,
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

async function appendScanLog(wikiRoot: string, target: ScanTarget, scanTime: string): Promise<void> {
  const logPath = join(wikiRoot, 'log.md')
  const entry = [
    `## ${scanTime} scan`,
    '',
    `- Branch: ${target.branch}`,
    `- Ref: ${target.ref}`,
    `- Commit: ${target.commit}`,
    `- Repository: ${target.project.repoUrl}`,
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

    files.push(await analyzeSourceFile(root, path))
  }

  return files
}

async function analyzeSourceFile(root: string, path: string): Promise<SourceFile> {
  const absolutePath = join(root, path)
  const stats = await Files.statPath(absolutePath)
  const extension = fileExtension(path)
  if (Number(stats.size) > 250_000) {
    return {
      extension,
      imports: [],
      path,
      symbols: []
    }
  }

  const text = await Files.readText(absolutePath).catch(() => '')
  return {
    extension,
    imports: extractImports(text),
    path,
    symbols: extractSymbols(text)
  }
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

function extractSymbols(text: string): string[] {
  const symbols = new Set<string>()
  const fallbackSymbols = new Set<string>()
  for (const match of text.matchAll(
    /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm
  )) {
    if (match[1] && isUsefulSymbol(match[1])) {
      symbols.add(match[1])
    }
  }

  for (const match of text.matchAll(/^\s*exports\.([A-Za-z_$][\w$]*)\s*=/gm)) {
    if (match[1] && isUsefulSymbol(match[1])) {
      symbols.add(match[1])
    }
  }

  for (const match of text.matchAll(/^\s*module\.exports\s*=\s*([A-Za-z_$][\w$]*)/gm)) {
    if (match[1] && isUsefulSymbol(match[1])) {
      symbols.add(match[1])
    }
  }

  for (const match of text.matchAll(
    /^\s*(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm
  )) {
    if (match[1] && isUsefulSymbol(match[1])) {
      fallbackSymbols.add(match[1])
    }
  }

  const visibleSymbols = symbols.size > 0 ? symbols : fallbackSymbols
  return [...visibleSymbols].sort((a, b) => a.localeCompare(b)).slice(0, 40)
}

function extractImports(text: string): string[] {
  const imports = new Set<string>()
  for (const match of text.matchAll(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
    if (match[1]) {
      imports.add(match[1])
    }
  }

  for (const match of text.matchAll(/^\s*(?:const|let|var)\s+[\w${}\s,]+\s*=\s*require\(['"]([^'"]+)['"]\)/gm)) {
    if (match[1]) {
      imports.add(match[1])
    }
  }

  return [...imports].sort((a, b) => a.localeCompare(b)).slice(0, 80)
}

function isUsefulSymbol(symbol: string): boolean {
  if (symbol.length < 3) {
    return false
  }

  if (/^(and|arg|args|before|after|next|prev|value|values|result|results|error|errors)$/i.test(symbol)) {
    return false
  }

  return /^[A-Z]/.test(symbol) || symbol.length >= 5
}

function entryPointRank(path: string): number {
  if (path === 'package.json' || path === 'README.md') {
    return 0
  }

  if (path.startsWith('packages/')) {
    return 1
  }

  if (path.startsWith('src/')) {
    return 2
  }

  if (path.startsWith('apps/')) {
    return 3
  }

  return 4
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

  if (ignoredFilePatterns.some(pattern => pattern.test(fileName))) {
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

function formatExtensionCounts(files: SourceFile[]): string {
  const counts = Object.entries(groupBy(files, file => file.extension || 'none'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([extension, matches]) => `${extension} ${matches.length}`)
  return counts.length > 0 ? counts.join(', ') : 'None observed.'
}

function isLikelyEntryPoint(path: string): boolean {
  return /(^|\/)(package\.json|README\.md|index\.(js|jsx|ts|tsx)|main\.(js|ts)|cli\.(js|ts)|jsx-runtime\.(js|ts))$/i.test(
    path
  )
}

function fileExtension(path: string): string {
  const fileName = path.split('/').at(-1) ?? path
  return fileName.includes('.') ? `.${fileName.split('.').at(-1)}` : fileName
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

  if (parts[0] === 'src' && parts[1] === 'renderers' && parts[2] && parts.length > 3) {
    return `src/renderers/${parts[2]}`
  }

  if (parts[0] === 'src' && parts.length === 2) {
    return 'src'
  }

  if (parts[0] === 'src' && parts[1]) {
    return `src/${parts[1]}`
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

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toPosixPath(path: string): string {
  return path.split('\\').join('/')
}
