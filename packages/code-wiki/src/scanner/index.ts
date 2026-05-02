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
  preservedPages: string[]
}

type SourceFile = {
  capabilitySignals: CapabilitySignal[]
  extension: string
  imports: string[]
  path: string
  symbols: string[]
}

type CapabilitySignal = {
  evidence: string[]
  id: string
  summary: string
  title: string
}

type CapabilitySignalDefinition = {
  appliesTo: 'chakra' | 'react'
  id: string
  patterns: RegExp[]
  summary: string
  title: string
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

const capabilitySignalDefinitions: CapabilitySignalDefinition[] = [
  {
    appliesTo: 'react',
    id: 'react.legacy-stack',
    patterns: [/stack\/reconciler/i, /ReactMount/i, /instantiateReactComponent/i, /ReactCompositeComponent/i],
    summary: 'Legacy React stack reconciler and mounting flow are present in the scanned source.',
    title: 'Legacy stack reconciler'
  },
  {
    appliesTo: 'react',
    id: 'react.fiber',
    patterns: [/ReactFiber/i, /FiberRoot/i, /createFiber/i, /packages\/react-reconciler/i],
    summary: 'Fiber reconciler code paths are present in the scanned source.',
    title: 'Fiber reconciler'
  },
  {
    appliesTo: 'react',
    id: 'react.concurrent-lanes',
    patterns: [/ReactFiberLane/i, /\bLanes?\b/, /ConcurrentRoot/i, /startTransition/i, /expirationTime/i],
    summary: 'Concurrent, async, or priority-based scheduling primitives are present.',
    title: 'Concurrent scheduling primitives'
  },
  {
    appliesTo: 'react',
    id: 'react.error-boundaries',
    patterns: [/componentDidCatch/i, /getDerivedStateFromError/i, /ReactErrorUtils/i],
    summary: 'Error boundary lifecycle or error capture internals are present.',
    title: 'Error boundaries'
  },
  {
    appliesTo: 'react',
    id: 'react.fragments',
    patterns: [/REACT_FRAGMENT_TYPE/i, /ReactFragment/i, /\bFragment\b/],
    summary: 'Fragment symbols or support code are present.',
    title: 'Fragments'
  },
  {
    appliesTo: 'react',
    id: 'react.hooks',
    summary: 'Hook APIs or hook dispatcher internals are present.',
    title: 'Hooks',
    patterns: [
      /ReactHooks/i,
      /\buse(State|Effect|Memo|Callback|Reducer|Ref|Context|Transition|DeferredValue|SyncExternalStore|Id)\b/
    ]
  },
  {
    appliesTo: 'react',
    id: 'react.actions',
    patterns: [/useActionState/i, /useOptimistic/i, /useFormStatus/i, /requestFormReset/i, /startHostTransition/i],
    summary: 'React 19 action, form status, or optimistic update primitives are present.',
    title: 'Actions and form status'
  },
  {
    appliesTo: 'react',
    id: 'react.portals',
    patterns: [/createPortal/i, /ReactPortal/i, /REACT_PORTAL_TYPE/i],
    summary: 'Portal creation symbols or portal internals are present.',
    title: 'Portals'
  },
  {
    appliesTo: 'react',
    id: 'react.suspense',
    patterns: [/\bSuspense\b/, /SuspenseList/i, /throwException/i],
    summary: 'Suspense-related API or reconciler behavior is present.',
    title: 'Suspense'
  },
  {
    appliesTo: 'react',
    id: 'react.server-components',
    patterns: [/react-server/i, /server-components/i, /ReactFlight/i, /FlightClient/i, /ServerReference/i],
    summary: 'Server Components or Flight-related source is present.',
    title: 'Server Components and Flight'
  },
  {
    appliesTo: 'react',
    id: 'react.dom-client-roots',
    patterns: [/createRoot/i, /hydrateRoot/i, /ReactDOMRoot/i],
    summary: 'Modern React DOM root creation and hydration APIs are present.',
    title: 'React DOM root APIs'
  },
  {
    appliesTo: 'react',
    id: 'react.jsx-runtime',
    patterns: [/jsx-runtime/i, /ReactJSX/i, /\bjsxDEV\b/],
    summary: 'Automatic JSX runtime entrypoints or helpers are present.',
    title: 'JSX runtime'
  },
  {
    appliesTo: 'chakra',
    id: 'chakra.design-system',
    patterns: [/packages\/react\/src\/(styled-system|theme|components|anatomy|recipes|preset|system)/i],
    summary: 'Design-system primitives such as tokens, recipes, anatomy, or theme code are present.',
    title: 'Design system primitives'
  },
  {
    appliesTo: 'chakra',
    id: 'chakra.accessibility',
    patterns: [/packages\/react\/src\/components\/(.*aria|focus|presence|popover|dialog|menu|tabs|tooltip)/i],
    summary: 'Accessibility, focus, presence, or interaction primitives are present.',
    title: 'Accessibility and interaction primitives'
  }
]

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

  await prepareWikiRoot(target.wikiRoot)

  const pages: WikiIndexPage[] = []
  for (const spec of pageSpecs) {
    const page = await writePage(target, spec, scanTime)
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
    ref: target.ref,
    repoUrl: target.project.repoUrl,
    schemaVersion: 1
  }

  await Files.writeJson(join(target.wikiRoot, 'index.json'), indexDocument)
  await Files.writeJson(join(target.wikiRoot, 'metadata.json'), metadata)
  await appendScanLog(target.wikiRoot, target, scanTime)

  return {
    index: indexDocument,
    metadata,
    preservedPages: []
  }
}

async function prepareWikiRoot(wikiRoot: string): Promise<void> {
  await Files.ensureDir(wikiRoot)
  for (const path of ['modules', 'contracts', 'flows']) {
    await Files.removePath(join(wikiRoot, path), { force: true, recursive: true })
    await Files.ensureDir(join(wikiRoot, path))
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
  const extensionLines = Object.entries(groupBy(sourceFiles, file => file.extension || 'none'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([extension, files]) => `${extension}: ${files.length}`)
  const signalLines = summarizeSignals(sourceFiles).map(
    signal =>
      `${signal.title}: ${signal.summary} Evidence: ${signal.evidence
        .slice(0, 5)
        .map(path => `\`${path}\``)
        .join(', ')}`
  )
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
    '## Detected Architecture Signals',
    '',
    markdownList(signalLines),
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
      const signalLines = summarizeSignals(files).map(
        signal =>
          `${signal.title}: ${signal.summary} Evidence: ${signal.evidence
            .slice(0, 5)
            .map(path => `\`${path}\``)
            .join(', ')}`
      )
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
        '## Detected Signals',
        '',
        markdownList(signalLines),
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
      capabilitySignals: capabilitySignalsFor(path, ''),
      extension,
      imports: [],
      path,
      symbols: []
    }
  }

  const text = await Files.readText(absolutePath).catch(() => '')
  return {
    capabilitySignals: capabilitySignalsFor(path, text),
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

function capabilitySignalsFor(path: string, text: string): CapabilitySignal[] {
  return capabilitySignalDefinitions
    .filter(definition => signalAppliesToPath(definition.appliesTo, path))
    .filter(definition => definition.patterns.some(pattern => pattern.test(path) || pattern.test(text)))
    .map(definition => ({
      evidence: [path],
      id: definition.id,
      summary: definition.summary,
      title: definition.title
    }))
}

function signalAppliesToPath(kind: 'chakra' | 'react', path: string): boolean {
  if (kind === 'react') {
    return isReactCoreSourcePath(path)
  }

  return path.startsWith('packages/')
}

function isReactCoreSourcePath(path: string): boolean {
  if (path.endsWith('.md')) {
    return false
  }

  if (path.startsWith('src/renderers/')) {
    return true
  }

  return /^packages\/(react|react-client|react-dom|react-native-renderer|react-noop-renderer|react-reconciler|react-server|react-test-renderer|scheduler|shared)\//.test(
    path
  )
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

function summarizeSignals(files: SourceFile[]): CapabilitySignal[] {
  const byId = new Map<string, CapabilitySignal>()
  for (const signal of files.flatMap(file => file.capabilitySignals)) {
    const existing = byId.get(signal.id)
    if (existing) {
      existing.evidence = uniq([...existing.evidence, ...signal.evidence])
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 12)
      continue
    }

    byId.set(signal.id, { ...signal })
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
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
