import { dirname, join } from 'node:path'

import * as Git from '@plimeor/git-kit'
import { groupBy, uniq } from 'es-toolkit/array'
import * as v from 'valibot'

import { Files } from '../files'
import { isRecord } from '../json'
import { markdownList, renderGeneratedPage, slugify } from '../markdown/pages'
import type {
  DiagramDocument,
  DiagramEdgeKind,
  DiagramNodeKind,
  ProjectEntry,
  ProjectMetadata,
  SourceReference,
  WikiIndexDocument,
  WikiIndexPage,
  WikiPageKind
} from '../types'
import { DiagramDocumentSchema, ProjectMetadataSchema, WikiIndexDocumentSchema } from '../types'

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
  symbolRefs: SymbolReference[]
  symbols: string[]
}

type SymbolReference = {
  line: number
  name: string
}

type PageSpec = {
  body: string
  id: string
  kind: WikiPageKind
  path: string
  sourceReferences: SourceReference[]
  sourceRefs: string[]
  summary: string
  symbols: string[]
  title: string
}

type ArtifactSpec = {
  diagrams: DiagramSpec[]
  pages: PageSpec[]
}

type DiagramSpec = {
  document: DiagramDocument
  mermaid: string
}

type RepositoryShape = {
  configFiles: string[]
  packageByPath: Map<string, PackageInfo>
  workspace: WorkspaceInfo
}

type WorkspaceInfo = {
  dependencyEdges: WorkspaceDependencyEdge[]
  manifestRefs: string[]
  units: WorkspaceUnit[]
}

type WorkspaceUnit = {
  dependencies: string[]
  id: string
  kind: 'app' | 'package' | 'workspace'
  name: string
  packageJsonPath: string
  path: string
  scripts: string[]
}

type WorkspaceDependencyEdge = {
  from: WorkspaceUnit
  kind: 'package' | 'tsconfig'
  sourcePath: string
  to: WorkspaceUnit
}

type PackageInfo = {
  dependencies: string[]
  files: string[]
  name: string
  packageJsonPath: string
  path: string
  raw: Record<string, unknown>
  scripts: string[]
}

const metadataFiles = new Set([
  'bun.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'pnpm-workspace.yaml',
  'turbo.json',
  'nx.json',
  'lerna.json',
  'tsconfig.json'
])

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

const ignoredFiles = new Set(['skills.lock.json', 'tsconfig.tsbuildinfo'])

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
    if (Files.isNotFound(error) || isInvalidGeneratedMetadata(error)) {
      return undefined
    }

    throw error
  }
}

function isInvalidGeneratedMetadata(error: unknown): boolean {
  return error instanceof SyntaxError || (error instanceof Error && error.name === 'ValiError')
}

export async function scanRepository(target: ScanTarget): Promise<ScanResult> {
  const scanTime = new Date().toISOString()
  const sourceFiles = await collectSourceFiles(target.repoRoot)
  const repositoryShape = await buildRepositoryShape(target, sourceFiles)
  const artifact = await buildArtifactSpec(target, sourceFiles, repositoryShape)
  const metadata: ProjectMetadata = {
    artifactVersion: 2,
    branch: target.branch,
    lastScannedAt: scanTime,
    lastScannedCommit: target.commit,
    projectId: target.project.id,
    ref: target.ref,
    repo: target.project.repo,
    schemaVersion: 1
  }

  const indexDocument = await writeWikiArtifact(target.wikiRoot, target, metadata, artifact, scanTime)

  return {
    index: indexDocument,
    metadata
  }
}

async function writeWikiArtifact(
  wikiRoot: string,
  target: ScanTarget,
  metadata: ProjectMetadata,
  artifact: ArtifactSpec,
  scanTime: string
): Promise<WikiIndexDocument> {
  validatePageSpecs(artifact.pages)

  const temporaryRoot = `${wikiRoot}.tmp-${process.pid}-${Date.now()}`
  let installed = false
  try {
    await Files.removePath(temporaryRoot, { force: true, recursive: true })
    await prepareWikiRoot(temporaryRoot)

    const pages: WikiIndexPage[] = []
    for (const spec of artifact.pages) {
      const page = await writePage(temporaryRoot, target, spec, scanTime)
      pages.push(page)
    }

    for (const diagram of artifact.diagrams) {
      await writeDiagram(temporaryRoot, diagram)
    }

    const indexDocument = v.parse(WikiIndexDocumentSchema, {
      commit: target.commit,
      pages: pages.sort((a, b) => a.id.localeCompare(b.id)),
      projectId: target.project.id,
      schemaVersion: 1
    })

    await Files.writeJson(join(temporaryRoot, 'index.json'), indexDocument)
    await writeAgentsFile(temporaryRoot)
    await appendScanLog(temporaryRoot, target, scanTime)
    await Files.writeJson(join(temporaryRoot, 'metadata.json'), metadata)
    await replaceWikiRoot(temporaryRoot, wikiRoot)
    installed = true

    return indexDocument
  } finally {
    if (!installed) {
      await Files.removePath(temporaryRoot, { force: true, recursive: true })
    }
  }
}

async function replaceWikiRoot(temporaryRoot: string, wikiRoot: string): Promise<void> {
  const backupRoot = `${wikiRoot}.backup-${process.pid}-${Date.now()}`
  await Files.ensureDir(dirname(wikiRoot))
  await Files.removePath(backupRoot, { force: true, recursive: true })

  if (!(await Files.pathExists(wikiRoot))) {
    await Files.movePath(temporaryRoot, wikiRoot)
    return
  }

  await Files.movePath(wikiRoot, backupRoot)
  try {
    await Files.movePath(temporaryRoot, wikiRoot)
  } catch (error) {
    if (!(await Files.pathExists(wikiRoot)) && (await Files.pathExists(backupRoot))) {
      await Files.movePath(backupRoot, wikiRoot)
    }
    throw error
  }

  await Files.removePath(backupRoot, { force: true, recursive: true })
}

async function prepareWikiRoot(wikiRoot: string): Promise<void> {
  await Files.removePath(wikiRoot, { force: true, recursive: true })
  await Files.ensureDir(wikiRoot)
  for (const path of ['modules', 'contracts', 'diagrams']) {
    await Files.ensureDir(join(wikiRoot, path))
  }
}

function validatePageSpecs(pageSpecs: PageSpec[]): void {
  assertUniquePageSpecValues(pageSpecs, 'id')
  assertUniquePageSpecValues(pageSpecs, 'path')
}

function assertUniquePageSpecValues(pageSpecs: PageSpec[], key: 'id' | 'path'): void {
  const seen = new Set<string>()
  for (const spec of pageSpecs) {
    const value = spec[key]
    if (seen.has(value)) {
      throw new Error(`Duplicate wiki page ${key}: ${value}`)
    }
    seen.add(value)
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
      '4. Open only the relevant `modules/`, `contracts/`, or `diagrams/` pages for the task.',
      '',
      '- Cite wiki page paths and their `sourceRefs` when using this wiki as evidence.',
      '- Prefer `sourceReferences` entries with commit and line details when a claim needs precise code evidence.',
      '- If evidence is insufficient, state exactly what source or diff is missing.',
      '- For code review, treat the wiki only as baseline context. Inspect the real diff and source before judging a defect.',
      '- Do not edit generated wiki files directly; regenerate them with `code-wiki scan`.',
      ''
    ].join('\n')
  )
}

async function buildArtifactSpec(
  target: ScanTarget,
  sourceFiles: SourceFile[],
  shape: RepositoryShape
): Promise<ArtifactSpec> {
  const moduleSpecs = buildModulePages(target, sourceFiles, shape)
  const contractSpecs = await buildContractPages(target, sourceFiles, shape)
  const diagrams = buildDiagrams(target, sourceFiles, shape)
  const diagramIndexSpec = buildDiagramIndexPage(diagrams)
  const overviewSpec = buildOverviewPage(target, sourceFiles, moduleSpecs, contractSpecs, shape)
  const indexSpec = buildHumanIndexPage(target, [...moduleSpecs, ...contractSpecs, diagramIndexSpec])
  const pages = [overviewSpec, indexSpec, ...moduleSpecs, ...contractSpecs, diagramIndexSpec].sort((a, b) =>
    a.id.localeCompare(b.id)
  )

  return {
    diagrams,
    pages
  }
}

function buildOverviewPage(
  target: ScanTarget,
  sourceFiles: SourceFile[],
  moduleSpecs: PageSpec[],
  contractSpecs: PageSpec[],
  shape: RepositoryShape
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
  const workspaceLines = shape.workspace.units.map(
    unit => `${unit.id}: ${unit.kind} at \`${unit.path}\`${unit.name ? ` (${unit.name})` : ''}`
  )
  const evidencePaths = uniq([
    ...shape.workspace.manifestRefs,
    ...shape.configFiles,
    ...entryPoints.slice(0, 20),
    ...sourceFiles
      .map(file => file.path)
      .filter(path => path === 'package.json' || path.endsWith('/package.json'))
      .slice(0, 20)
  ])
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 60)
  const sourceReferences = evidencePaths.map(path => createSourceReference(target, path))
  const body = [
    `# ${target.project.id}`,
    '',
    '## Observed Repository Facts',
    '',
    markdownList([
      `Project id: ${target.project.id}`,
      `Repository source: ${target.project.repo}`,
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
    '## Monorepo Workspace',
    '',
    markdownList(workspaceLines.length > 0 ? workspaceLines : ['No workspace units observed.']),
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
    '',
    '## Source References',
    '',
    markdownList(formatSourceRefs(sourceReferences).map(ref => `\`${ref}\``)),
    ''
  ].join('\n')

  return {
    body,
    id: 'overview',
    kind: 'overview',
    path: 'overview.md',
    sourceReferences,
    sourceRefs: formatSourceRefs(sourceReferences),
    summary: 'Project purpose, boundaries, entry points, major subsystems, and workspace shape.',
    symbols: [],
    title: `${target.project.id} Overview`
  }
}

function buildHumanIndexPage(target: ScanTarget, pages: PageSpec[]): PageSpec {
  const pageLines = pages.map(page => `${page.id} -> \`${page.path}\`: ${page.summary}`)
  const body = [
    `# ${target.project.id} Routing Index`,
    '',
    'Use this index before loading page bodies. Prefer focused module and contract pages over the whole wiki.',
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
    sourceReferences: [],
    sourceRefs: ['index.json'],
    summary: 'Human-readable routing index for selecting focused wiki pages.',
    symbols: [],
    title: `${target.project.id} Routing Index`
  }
}

function buildModulePages(target: ScanTarget, sourceFiles: SourceFile[], shape: RepositoryShape): PageSpec[] {
  const groups = groupBy(sourceFiles, file => moduleGroup(file.path, shape.workspace.units))

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, files]) => {
      const unit = shape.workspace.units.find(candidate => candidate.path === group)
      const packageInfo = shape.packageByPath.get(group)
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
      const workspaceDependencies = unit
        ? shape.workspace.dependencyEdges
            .filter(edge => edge.from.path === unit.path)
            .map(edge => `${edge.to.id} (${edge.to.name})`)
            .sort((a, b) => a.localeCompare(b))
        : []
      const id = `module.${logicalId(group)}`
      const sourceReferences = files
        .flatMap(file => fileSourceReferences(target, file, unit?.id))
        .sort((a, b) => compareSourceReference(a, b))
        .slice(0, 80)
      const sourceRefs = formatSourceRefs(sourceReferences)
      const title = `${titleize(group)} Module`
      const body = [
        `# ${title}`,
        '',
        '## Responsibility',
        '',
        `Generated summary for \`${target.project.id}\` files under \`${group}\`. Treat this as routing context, not final human design truth.`,
        '',
        '## Source Shape',
        '',
        markdownList([
          `Indexed files: ${files.length}`,
          `Extensions: ${formatExtensionCounts(files)}`,
          `Source refs: ${sourceRefs.map(ref => `\`${ref}\``).join(', ')}`
        ]),
        '',
        '## Package Boundary',
        '',
        markdownList(formatPackageBoundary(unit, packageInfo)),
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
          `External imports: ${externalImports.length > 0 ? externalImports.map(value => `\`${value}\``).join(', ') : 'None observed.'}`,
          `Workspace dependencies: ${workspaceDependencies.length > 0 ? workspaceDependencies.map(value => `\`${value}\``).join(', ') : 'None observed.'}`
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
        '',
        '## Source References',
        '',
        markdownList(sourceRefs.map(ref => `\`${ref}\``)),
        ''
      ].join('\n')

      return {
        body,
        id,
        kind: 'module',
        path: group === 'root' ? 'modules/root.md' : `modules/${group}.md`,
        sourceReferences,
        sourceRefs,
        summary: `Files and symbols under ${group}.`,
        symbols,
        title
      }
    })
}

async function buildContractPages(
  target: ScanTarget,
  sourceFiles: SourceFile[],
  shape: RepositoryShape
): Promise<PageSpec[]> {
  const pages: PageSpec[] = []
  if (sourceFiles.some(file => file.path === 'package.json')) {
    pages.push(await buildPackageContract(target))
  }

  if (shape.workspace.units.length > 0 || shape.workspace.manifestRefs.length > 0) {
    pages.push(buildWorkspaceContract(target, shape))
  }

  const routeFiles = sourceFiles
    .map(file => file.path)
    .filter(isRouteLikeFile)
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
  const sourceReferences = [createSourceReference(target, 'package.json')]
  const body = [
    '# Package Contract',
    '',
    '## Observed Facts',
    '',
    markdownList([
      `Package name: ${String(packageJson.name ?? target.project.id)}`,
      `Package type: ${String(packageJson.type ?? 'unspecified')}`,
      `Executable bins: ${formatPackageBins(packageJson.bin)}`,
      `Entry points: ${formatPackageEntrypoints(packageJson)}`,
      `Exports: ${formatPackageExports(packageJson.exports)}`,
      `Files whitelist: ${formatInlineList(collectPackageFiles(packageJson))}`
    ]),
    '',
    '## Scripts',
    '',
    markdownList(scripts.map(script => `\`${script}\``)),
    '',
    '## Dependency Surface',
    '',
    markdownList(dependencies.map(name => `\`${name}\``)),
    '',
    '## Source References',
    '',
    markdownList(formatSourceRefs(sourceReferences).map(ref => `\`${ref}\``)),
    ''
  ].join('\n')

  return {
    body,
    id: 'contract.package',
    kind: 'contract',
    path: 'contracts/package.md',
    sourceReferences,
    sourceRefs: ['package.json'],
    summary: 'Package metadata, scripts, bins, and dependency boundary.',
    symbols: [],
    title: 'Package Contract'
  }
}

function buildWorkspaceContract(target: ScanTarget, shape: RepositoryShape): PageSpec {
  const unitLines = shape.workspace.units.map(
    unit =>
      `${unit.id}: ${unit.kind} at \`${unit.path}\`, package \`${unit.name}\`, scripts ${formatInlineList(unit.scripts)}`
  )
  const edgeLines = shape.workspace.dependencyEdges.map(
    edge => `${edge.from.id} -> ${edge.to.id}, ${edge.kind} edge observed in \`${edge.sourcePath}\``
  )
  const sourceReferences = [
    ...shape.workspace.manifestRefs.map(path => createSourceReference(target, path)),
    ...shape.workspace.units.map(unit =>
      createSourceReference(target, unit.packageJsonPath, undefined, undefined, undefined, unit.id)
    ),
    ...shape.workspace.dependencyEdges.map(edge =>
      createSourceReference(target, edge.sourcePath, undefined, undefined, undefined, edge.from.id)
    )
  ].sort((a, b) => compareSourceReference(a, b))
  const body = [
    '# Workspace Contract',
    '',
    '## Observed Workspace Inputs',
    '',
    markdownList(shape.workspace.manifestRefs.map(path => `\`${path}\``)),
    '',
    '## Ownership Units',
    '',
    markdownList(unitLines),
    '',
    '## Workspace Dependency Edges',
    '',
    markdownList(edgeLines),
    '',
    '## Shared Configuration',
    '',
    markdownList(shape.configFiles.map(path => `\`${path}\``)),
    '',
    '## Source References',
    '',
    markdownList(formatSourceRefs(sourceReferences).map(ref => `\`${ref}\``)),
    ''
  ].join('\n')

  return {
    body,
    id: 'contract.workspace',
    kind: 'contract',
    path: 'contracts/workspace.md',
    sourceReferences,
    sourceRefs: formatSourceRefs(sourceReferences),
    summary: 'Monorepo workspace units, shared config, and package dependency edges.',
    symbols: [],
    title: 'Workspace Contract'
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
    '',
    '## Source References',
    '',
    markdownList(routeFiles.map(path => `\`${path}\``)),
    ''
  ].join('\n')

  return {
    body,
    id: 'contract.routes',
    kind: 'contract',
    path: 'contracts/routes.md',
    sourceReferences: routeFiles.map(path => createSourceReference(target, path)),
    sourceRefs: routeFiles,
    summary: 'Route-like files that may affect request, response, or navigation contracts.',
    symbols: [],
    title: 'Route Contract'
  }
}

function buildDiagramIndexPage(diagrams: DiagramSpec[]): PageSpec {
  const sourceReferences = diagrams
    .flatMap(diagram => [
      ...diagram.document.nodes.flatMap(node => node.sourceRefs),
      ...diagram.document.edges.flatMap(edge => edge.sourceRefs)
    ])
    .sort((a, b) => compareSourceReference(a, b))
    .slice(0, 80)
  const diagramLines = diagrams.map(diagram => {
    const document = diagram.document
    return `${document.id}: \`${document.mermaidPath}\` and \`diagrams/${document.id}.json\`; ${document.nodes.length} nodes, ${document.edges.length} edges.`
  })
  const body = [
    '# Diagram Index',
    '',
    'Diagrams are generated routing aids. Treat them as source-derived maps, not final architecture authority.',
    '',
    '## Generated Diagrams',
    '',
    markdownList(diagramLines),
    '',
    '## Evidence Scope',
    '',
    markdownList([
      'Workspace diagrams use package/workspace manifests and shared config files.',
      'Dependency diagrams use declared workspace dependencies and observed import specifiers.',
      'Module diagrams use key files, local symbol declarations, and same-module import edges.',
      'Route diagrams use route-like files and their owning modules when route files are observed.',
      'Sequence diagrams are omitted unless call-order evidence is strong enough to avoid inventing behavior.',
      'Large repositories are summarized at workspace or module level to keep diagrams readable.'
    ]),
    '',
    '## Source References',
    '',
    markdownList(formatSourceRefs(sourceReferences).map(ref => `\`${ref}\``)),
    ''
  ].join('\n')

  return {
    body,
    id: 'diagram.index',
    kind: 'diagram',
    path: 'diagrams/index.md',
    sourceReferences,
    sourceRefs: formatSourceRefs(sourceReferences),
    summary: 'Generated diagram inventory and evidence scope.',
    symbols: [],
    title: 'Diagram Index'
  }
}

function buildDiagrams(target: ScanTarget, sourceFiles: SourceFile[], shape: RepositoryShape): DiagramSpec[] {
  const diagrams = [
    buildWorkspaceDiagram(target, shape),
    buildDependencyDiagram(target, sourceFiles, shape),
    ...buildModuleDiagrams(target, sourceFiles, shape)
  ]
  const routeDiagram = buildRouteDiagram(target, sourceFiles, shape)
  if (routeDiagram) {
    diagrams.push(routeDiagram)
  }

  return diagrams
}

function buildWorkspaceDiagram(target: ScanTarget, shape: RepositoryShape): DiagramSpec {
  const rootRefs = [...shape.workspace.manifestRefs, ...shape.configFiles]
    .slice(0, 1)
    .map(path => createSourceReference(target, path))
  const nodes = [
    diagramNode('repo.root', target.project.id, 'repo', rootRefs),
    ...shape.workspace.units.map(unit =>
      diagramNode(unit.id, unit.name, unit.kind === 'app' ? 'app' : 'package', [
        createSourceReference(target, unit.packageJsonPath, undefined, undefined, undefined, unit.id)
      ])
    ),
    ...shape.configFiles.map(path =>
      diagramNode(`config.${logicalId(path)}`, path, 'file', [createSourceReference(target, path)])
    )
  ]
  const edges = [
    ...shape.workspace.units.map(unit =>
      diagramEdge('repo.root', unit.id, 'declares', [
        createSourceReference(target, unit.packageJsonPath, undefined, undefined, undefined, unit.id)
      ])
    ),
    ...shape.workspace.dependencyEdges.map(edge =>
      diagramEdge(edge.from.id, edge.to.id, 'depends_on', [
        createSourceReference(target, edge.sourcePath, undefined, undefined, undefined, edge.from.id)
      ])
    ),
    ...shape.configFiles.map(path =>
      diagramEdge('repo.root', `config.${logicalId(path)}`, 'configures', [createSourceReference(target, path)])
    )
  ]
  const document = diagramDocument(target, 'workspace-graph', 'Workspace Graph', 'workspace', nodes, edges)

  return {
    document,
    mermaid: renderMermaid(document)
  }
}

function buildDependencyDiagram(target: ScanTarget, sourceFiles: SourceFile[], shape: RepositoryShape): DiagramSpec {
  const groups = groupBy(sourceFiles, file => moduleGroup(file.path, shape.workspace.units))
  const moduleNodes = Object.entries(groups).map(([group, files]) =>
    diagramNode(
      `module.${logicalId(group)}`,
      group,
      'module',
      files.slice(0, 10).map(file => createSourceReference(target, file.path))
    )
  )
  const edges = new Map<string, ReturnType<typeof diagramEdge>>()

  for (const file of sourceFiles) {
    const fromGroup = moduleGroup(file.path, shape.workspace.units)
    const from = `module.${logicalId(fromGroup)}`
    for (const imported of file.imports) {
      const targetPath = resolveRelativeImportPath(file.path, imported, sourceFiles)
      if (!targetPath) {
        continue
      }

      const toGroup = moduleGroup(targetPath, shape.workspace.units)
      if (toGroup === fromGroup) {
        continue
      }

      const to = `module.${logicalId(toGroup)}`
      const key = `${from}->${to}`
      if (!edges.has(key)) {
        edges.set(key, diagramEdge(from, to, 'imports', [createSourceReference(target, file.path)]))
      }
    }
  }

  for (const edge of shape.workspace.dependencyEdges) {
    const from = `module.${logicalId(edge.from.path)}`
    const to = `module.${logicalId(edge.to.path)}`
    const key = `${from}->${to}`
    if (!edges.has(key)) {
      edges.set(
        key,
        diagramEdge(from, to, 'depends_on', [
          createSourceReference(target, edge.sourcePath, undefined, undefined, undefined, edge.from.id)
        ])
      )
    }
  }

  const document = diagramDocument(
    target,
    'dependency-graph',
    'Dependency Graph',
    'dependency',
    moduleNodes.slice(0, 80),
    [...edges.values()].slice(0, 120)
  )

  return {
    document,
    mermaid: renderMermaid(document)
  }
}

function buildModuleDiagrams(target: ScanTarget, sourceFiles: SourceFile[], shape: RepositoryShape): DiagramSpec[] {
  const groups = Object.entries(groupBy(sourceFiles, file => moduleGroup(file.path, shape.workspace.units)))
    .filter(([, files]) => files.some(file => file.symbolRefs.length > 0 || file.imports.length > 0))
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 20)

  return groups.map(([group, files]) => {
    const moduleNodeId = `module.${logicalId(group)}`
    const fileNodes = files
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 12)
      .map(file =>
        diagramNode(`file.${logicalId(file.path)}`, file.path, 'file', [createSourceReference(target, file.path)])
      )
    const symbolNodes = files
      .flatMap(file =>
        file.symbolRefs.slice(0, 4).map(symbol => ({
          file,
          symbol
        }))
      )
      .slice(0, 24)
      .map(({ file, symbol }) =>
        diagramNode(`symbol.${logicalId(file.path)}.${logicalId(symbol.name)}`, symbol.name, 'symbol', [
          createSourceReference(target, file.path, symbol.line, symbol.line, symbol.name)
        ])
      )
    const nodes = [
      diagramNode(
        moduleNodeId,
        group,
        'module',
        files.slice(0, 10).map(file => createSourceReference(target, file.path))
      ),
      ...fileNodes,
      ...symbolNodes
    ]
    const edges = [
      ...fileNodes.map(node => diagramEdge(moduleNodeId, node.id, 'declares', node.sourceRefs)),
      ...symbolNodes.map(node => {
        const sourceRef = node.sourceRefs[0]
        const fileNode = sourceRef ? `file.${logicalId(sourceRef.path)}` : moduleNodeId
        return diagramEdge(fileNode, node.id, 'exports', node.sourceRefs)
      }),
      ...moduleInternalImportEdges(target, files)
    ]
    const document = diagramDocument(
      target,
      `module-${logicalId(group)}`,
      `${titleize(group)} Module Graph`,
      'module',
      nodes,
      edges
    )

    return {
      document,
      mermaid: renderMermaid(document)
    }
  })
}

function moduleInternalImportEdges(target: ScanTarget, files: SourceFile[]): ReturnType<typeof diagramEdge>[] {
  const fileByPath = new Map(files.map(file => [file.path, file]))
  const edges: ReturnType<typeof diagramEdge>[] = []

  for (const file of files) {
    for (const imported of file.imports) {
      const targetPath = resolveRelativeImportPath(file.path, imported, files)
      if (targetPath && fileByPath.has(targetPath) && targetPath !== file.path) {
        edges.push(
          diagramEdge(`file.${logicalId(file.path)}`, `file.${logicalId(targetPath)}`, 'imports', [
            createSourceReference(target, file.path)
          ])
        )
      }
    }
  }

  return edges.slice(0, 40)
}

function buildRouteDiagram(
  target: ScanTarget,
  sourceFiles: SourceFile[],
  shape: RepositoryShape
): DiagramSpec | undefined {
  const routeFiles = sourceFiles
    .filter(file => isRouteLikeFile(file.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 80)
  if (routeFiles.length === 0) {
    return undefined
  }

  const routeNodes = routeFiles.map(file =>
    diagramNode(`route.${logicalId(file.path)}`, file.path, 'file', [createSourceReference(target, file.path)])
  )
  const routeFilesByModule = groupBy(routeFiles, file => moduleGroup(file.path, shape.workspace.units))
  const moduleNodes = Object.entries(routeFilesByModule).map(([group, files]) =>
    diagramNode(
      `module.${logicalId(group)}`,
      group,
      'module',
      files.slice(0, 10).map(file => createSourceReference(target, file.path))
    )
  )
  const edges = routeFiles.map(file =>
    diagramEdge(
      `module.${logicalId(moduleGroup(file.path, shape.workspace.units))}`,
      `route.${logicalId(file.path)}`,
      'routes_to',
      [createSourceReference(target, file.path)]
    )
  )
  const document = diagramDocument(
    target,
    'route-graph',
    'Route Graph',
    'route',
    [...moduleNodes, ...routeNodes],
    edges
  )

  return {
    document,
    mermaid: renderMermaid(document)
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
    id: spec.id,
    kind: spec.kind,
    lastScannedCommit: target.commit,
    path: spec.path,
    sourceReferences: spec.sourceReferences,
    sourceRefs: spec.sourceRefs,
    summary: spec.summary,
    symbols: spec.symbols,
    title: spec.title
  }
}

async function writeDiagram(wikiRoot: string, spec: DiagramSpec): Promise<void> {
  const document = v.parse(DiagramDocumentSchema, spec.document)
  await Files.writeText(join(wikiRoot, document.mermaidPath), spec.mermaid)
  await Files.writeJson(join(wikiRoot, 'diagrams', `${document.id}.json`), document)
}

async function appendScanLog(wikiRoot: string, target: ScanTarget, scanTime: string): Promise<void> {
  const logPath = join(wikiRoot, 'log.md')
  const entry = [
    `## ${scanTime} scan`,
    '',
    `- Branch: ${target.branch}`,
    `- Ref: ${target.ref}`,
    `- Commit: ${target.commit}`,
    `- Repository: ${target.project.repo}`,
    ''
  ].join('\n')
  const existing = (await Files.pathExists(logPath)) ? await Files.readText(logPath) : `# ${target.project.id} Log\n\n`
  await Files.writeText(logPath, `${existing.trimEnd()}\n\n${entry}`)
}

async function buildRepositoryShape(target: ScanTarget, sourceFiles: SourceFile[]): Promise<RepositoryShape> {
  const packageInfos = await collectPackageInfos(target, sourceFiles)
  const workspaceManifestRefs = collectWorkspaceManifestRefs(sourceFiles)
  const workspacePatterns = await collectWorkspacePatterns(target, packageInfos, sourceFiles)
  const workspaceUnits = collectWorkspaceUnits(packageInfos, workspaceManifestRefs, workspacePatterns)
  const dependencyEdges = mergeWorkspaceDependencyEdges([
    ...collectWorkspaceDependencyEdges(workspaceUnits),
    ...(await collectTsconfigReferenceEdges(target, sourceFiles, workspaceUnits))
  ])
  const workspace = {
    dependencyEdges,
    manifestRefs: workspaceManifestRefs,
    units: workspaceUnits
  }

  return {
    configFiles: collectSharedConfigFiles(sourceFiles),
    packageByPath: new Map(packageInfos.map(info => [info.path, info])),
    workspace
  }
}

async function collectPackageInfos(target: ScanTarget, sourceFiles: SourceFile[]): Promise<PackageInfo[]> {
  const packageJsonPaths = sourceFiles
    .map(file => file.path)
    .filter(path => path === 'package.json' || path.endsWith('/package.json'))
    .sort((a, b) => a.localeCompare(b))
  const infos: PackageInfo[] = []

  for (const packageJsonPath of packageJsonPaths) {
    const raw = await Files.readText(join(target.repoRoot, packageJsonPath))
    const packageJson = JSON.parse(raw) as Record<string, unknown>
    const packagePath = packageJsonPath === 'package.json' ? 'root' : dirname(packageJsonPath)
    infos.push({
      dependencies: collectPackageDependencies(packageJson),
      files: collectPackageFiles(packageJson),
      name: String(packageJson.name ?? packagePath),
      packageJsonPath,
      path: packagePath,
      raw: packageJson,
      scripts: collectPackageScripts(packageJson)
    })
  }

  return infos
}

function collectWorkspaceManifestRefs(sourceFiles: SourceFile[]): string[] {
  return sourceFiles
    .map(file => file.path)
    .filter(path => metadataFiles.has(path))
    .sort((a, b) => a.localeCompare(b))
}

async function collectWorkspacePatterns(
  target: ScanTarget,
  packageInfos: PackageInfo[],
  sourceFiles: SourceFile[]
): Promise<string[]> {
  const rootPackage = packageInfos.find(info => info.path === 'root')
  const packageJsonPatterns = rootPackage ? collectPackageJsonWorkspacePatterns(rootPackage.raw) : []
  const pnpmPatterns = sourceFiles.some(file => file.path === 'pnpm-workspace.yaml')
    ? await readPnpmWorkspacePatterns(target)
    : []
  const lernaPatterns = sourceFiles.some(file => file.path === 'lerna.json')
    ? await readLernaWorkspacePatterns(target)
    : []
  const nxPatterns = sourceFiles.some(file => file.path === 'nx.json') ? await readNxWorkspacePatterns(target) : []

  return uniq([...packageJsonPatterns, ...pnpmPatterns, ...lernaPatterns, ...nxPatterns]).sort((a, b) =>
    a.localeCompare(b)
  )
}

async function readPnpmWorkspacePatterns(target: ScanTarget): Promise<string[]> {
  const text = await Files.readText(join(target.repoRoot, 'pnpm-workspace.yaml'))
  const patterns: string[] = []
  let inPackages = false

  for (const line of text.split('\n')) {
    if (/^\s*packages\s*:/.test(line)) {
      inPackages = true
      continue
    }

    if (inPackages && /^\S/.test(line)) {
      break
    }

    const match = line.match(/^\s*-\s*['"]?([^'"\s#]+)['"]?/)
    if (inPackages && match?.[1] && !match[1].startsWith('!')) {
      patterns.push(match[1])
    }
  }

  return patterns
}

async function readLernaWorkspacePatterns(target: ScanTarget): Promise<string[]> {
  const raw = await Files.readText(join(target.repoRoot, 'lerna.json'))
  const config = parseJsonConfigObject(raw)
  return Array.isArray(config.packages)
    ? config.packages.filter((value): value is string => typeof value === 'string')
    : []
}

async function readNxWorkspacePatterns(target: ScanTarget): Promise<string[]> {
  const raw = await Files.readText(join(target.repoRoot, 'nx.json'))
  const config = parseJsonConfigObject(raw)
  const projects = isRecord(config.projects) ? config.projects : undefined
  if (!projects) {
    return []
  }

  const patterns: string[] = []
  for (const [key, value] of Object.entries(projects)) {
    if (typeof value === 'string') {
      patterns.push(value)
      continue
    }

    if (isRecord(value) && typeof value.root === 'string') {
      patterns.push(value.root)
      continue
    }

    if (key.includes('/')) {
      patterns.push(key)
    }
  }

  return patterns
}

function collectWorkspaceUnits(
  packageInfos: PackageInfo[],
  manifestRefs: string[],
  workspacePatterns: string[]
): WorkspaceUnit[] {
  const hasWorkspaceManifest = manifestRefs.some(path => path !== 'package.json' && path !== 'tsconfig.json')
  const units = packageInfos
    .filter(info => info.path !== 'root')
    .filter(info => {
      if (info.path.startsWith('apps/') || info.path.startsWith('packages/') || info.path.startsWith('libs/')) {
        return true
      }

      return workspacePatterns.some(pattern => pathMatchesWorkspacePattern(info.path, pattern))
    })
    .map(info => ({
      dependencies: info.dependencies,
      id: logicalId(info.path),
      kind: workspaceUnitKind(info.path),
      name: info.name,
      packageJsonPath: info.packageJsonPath,
      path: info.path,
      scripts: info.scripts
    }))

  if (units.length === 0 && hasWorkspaceManifest) {
    return []
  }

  return units.sort((a, b) => a.path.localeCompare(b.path))
}

function collectPackageJsonWorkspacePatterns(packageJson: Record<string, unknown>): string[] {
  const workspaces = packageJson.workspaces
  if (Array.isArray(workspaces)) {
    return workspaces.filter((value): value is string => typeof value === 'string')
  }

  if (isRecord(workspaces) && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((value): value is string => typeof value === 'string')
  }

  return []
}

function pathMatchesWorkspacePattern(path: string, pattern: string): boolean {
  const normalized = pattern.replace(/\/+$/, '')
  if (normalized.endsWith('/*')) {
    const prefix = normalized.slice(0, -2)
    const rest = path.slice(prefix.length + 1)
    return path.startsWith(`${prefix}/`) && rest.length > 0 && !rest.includes('/')
  }

  if (normalized.endsWith('/**')) {
    return path.startsWith(`${normalized.slice(0, -3)}/`)
  }

  return path === normalized
}

function workspaceUnitKind(path: string): WorkspaceUnit['kind'] {
  if (path.startsWith('apps/')) {
    return 'app'
  }

  if (path.startsWith('packages/') || path.startsWith('libs/')) {
    return 'package'
  }

  return 'workspace'
}

function collectWorkspaceDependencyEdges(units: WorkspaceUnit[]): WorkspaceDependencyEdge[] {
  const byPackageName = new Map(units.map(unit => [unit.name, unit]))
  const byDependencyName = new Map(units.map(unit => [unit.id, unit]))
  const edges: WorkspaceDependencyEdge[] = []

  for (const unit of units) {
    for (const dependency of unit.dependencies) {
      const targetUnit = byPackageName.get(dependency) ?? byDependencyName.get(logicalId(dependency))
      if (targetUnit && targetUnit.path !== unit.path) {
        edges.push({
          from: unit,
          kind: 'package',
          sourcePath: unit.packageJsonPath,
          to: targetUnit
        })
      }
    }
  }

  return edges.sort((a, b) => `${a.from.id}:${a.to.id}`.localeCompare(`${b.from.id}:${b.to.id}`))
}

async function collectTsconfigReferenceEdges(
  target: ScanTarget,
  sourceFiles: SourceFile[],
  units: WorkspaceUnit[]
): Promise<WorkspaceDependencyEdge[]> {
  const tsconfigPaths = sourceFiles
    .map(file => file.path)
    .filter(path => path === 'tsconfig.json' || path.endsWith('/tsconfig.json'))
    .sort((a, b) => a.localeCompare(b))
  const edges: WorkspaceDependencyEdge[] = []

  for (const tsconfigPath of tsconfigPaths) {
    const fromUnit = unitForPath(dirname(tsconfigPath), units)
    if (!fromUnit) {
      continue
    }

    const raw = await Files.readText(join(target.repoRoot, tsconfigPath))
    const tsconfig = parseJsonConfigObject(raw)
    const references = Array.isArray(tsconfig.references) ? tsconfig.references : []
    for (const reference of references) {
      if (!isRecord(reference) || typeof reference.path !== 'string') {
        continue
      }

      const referencedPath = normalizePath(join(dirname(tsconfigPath), reference.path))
      const toUnit = unitForPath(referencedPath, units)
      if (toUnit && toUnit.path !== fromUnit.path) {
        edges.push({
          from: fromUnit,
          kind: 'tsconfig',
          sourcePath: tsconfigPath,
          to: toUnit
        })
      }
    }
  }

  return edges
}

function mergeWorkspaceDependencyEdges(edges: WorkspaceDependencyEdge[]): WorkspaceDependencyEdge[] {
  const byKey = new Map<string, WorkspaceDependencyEdge>()
  for (const edge of edges) {
    const key = `${edge.from.id}:${edge.to.id}:${edge.kind}:${edge.sourcePath}`
    byKey.set(key, edge)
  }

  return [...byKey.values()].sort((a, b) =>
    `${a.from.id}:${a.to.id}:${a.kind}:${a.sourcePath}`.localeCompare(
      `${b.from.id}:${b.to.id}:${b.kind}:${b.sourcePath}`
    )
  )
}

function unitForPath(path: string, units: WorkspaceUnit[]): WorkspaceUnit | undefined {
  return units
    .filter(unit => path === unit.path || path.startsWith(`${unit.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

function collectSharedConfigFiles(sourceFiles: SourceFile[]): string[] {
  return sourceFiles
    .map(file => file.path)
    .filter(path =>
      /^(biome\.json|eslint\.config\.[cm]?[jt]s|tsconfig\.json|turbo\.json|nx\.json|lerna\.json|changeset\/config\.json|\.changeset\/config\.json|vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|bunfig\.toml)$/.test(
        path
      )
    )
    .sort((a, b) => a.localeCompare(b))
}

async function collectSourceFiles(root: string): Promise<SourceFile[]> {
  const paths = await Git.listFiles(root)
  const files: SourceFile[] = []
  for (const path of paths.sort((a, b) => a.localeCompare(b))) {
    if (isIgnoredDirectoryPath(path)) {
      continue
    }

    if (!isCandidateSource(path)) {
      continue
    }

    const file = await analyzeSourceFile(root, path)
    if (file) {
      files.push(file)
    }
  }

  return files
}

function isIgnoredDirectoryPath(path: string): boolean {
  for (const segment of path.split('/')) {
    if (ignoredDirectories.has(segment)) {
      return true
    }
  }

  return false
}

async function analyzeSourceFile(root: string, path: string): Promise<SourceFile | undefined> {
  const absolutePath = join(root, path)
  let stats: Awaited<ReturnType<typeof Files.statPath>>
  try {
    stats = await Files.statPath(absolutePath)
  } catch (error) {
    if (Files.isNotFound(error)) {
      return undefined
    }
    throw error
  }
  const extension = fileExtension(path)
  if (Number(stats.size) > 250_000) {
    return {
      extension,
      imports: [],
      path,
      symbolRefs: [],
      symbols: []
    }
  }

  let text = ''
  try {
    text = await Files.readText(absolutePath)
  } catch (error) {
    if (Files.isNotFound(error)) {
      return undefined
    }
    throw error
  }
  const symbolRefs = extractSymbolReferences(text)
  return {
    extension,
    imports: extractImports(text),
    path,
    symbolRefs,
    symbols: symbolRefs.map(symbol => symbol.name)
  }
}

function extractSymbolReferences(text: string): SymbolReference[] {
  const symbols = new Map<string, SymbolReference>()
  const fallbackSymbols = new Map<string, SymbolReference>()
  for (const match of text.matchAll(
    /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm
  )) {
    if (match[1] && isUsefulSymbol(match[1])) {
      symbols.set(match[1], { line: lineNumberAt(text, match.index ?? 0), name: match[1] })
    }
  }

  for (const match of text.matchAll(/^\s*exports\.([A-Za-z_$][\w$]*)\s*=/gm)) {
    if (match[1] && isUsefulSymbol(match[1])) {
      symbols.set(match[1], { line: lineNumberAt(text, match.index ?? 0), name: match[1] })
    }
  }

  for (const match of text.matchAll(/^\s*module\.exports\s*=\s*([A-Za-z_$][\w$]*)/gm)) {
    if (match[1] && isUsefulSymbol(match[1])) {
      symbols.set(match[1], { line: lineNumberAt(text, match.index ?? 0), name: match[1] })
    }
  }

  for (const match of text.matchAll(
    /^\s*(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm
  )) {
    if (match[1] && isUsefulSymbol(match[1])) {
      fallbackSymbols.set(match[1], { line: lineNumberAt(text, match.index ?? 0), name: match[1] })
    }
  }

  const visibleSymbols = symbols.size > 0 ? symbols : fallbackSymbols
  return [...visibleSymbols.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40)
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

  for (const match of text.matchAll(/^\s*export\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) {
    if (match[1]) {
      imports.add(match[1])
    }
  }

  for (const match of text.matchAll(/\bimport\(['"]([^'"]+)['"]\)/gm)) {
    if (match[1]) {
      imports.add(match[1])
    }
  }

  return [...imports].sort((a, b) => a.localeCompare(b)).slice(0, 80)
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
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

function isCandidateSource(path: string): boolean {
  const fileName = path.split('/').at(-1) ?? path
  if (ignoredFiles.has(fileName)) {
    return false
  }

  if (metadataFiles.has(path) || metadataFiles.has(fileName)) {
    return true
  }

  if (ignoredFilePatterns.some(pattern => pattern.test(fileName))) {
    return false
  }

  const extension = fileName.includes('.') ? `.${fileName.split('.').at(-1)}` : ''
  return sourceExtensions.has(extension) || fileName === 'README' || fileName === 'Dockerfile'
}

function formatExtensionCounts(files: SourceFile[]): string {
  const counts = Object.entries(groupBy(files, file => file.extension || 'none'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([extension, matches]) => `${extension} ${matches.length}`)
  return counts.length > 0 ? counts.join(', ') : 'None observed.'
}

function formatPackageBoundary(unit: WorkspaceUnit | undefined, packageInfo: PackageInfo | undefined): string[] {
  if (!unit && !packageInfo) {
    return ['No package boundary observed for this module.']
  }

  const lines: string[] = []
  if (unit) {
    lines.push(`Workspace unit: ${unit.id}`)
    lines.push(`Unit kind: ${unit.kind}`)
    lines.push(`Package name: ${unit.name}`)
    lines.push(`Package manifest: \`${unit.packageJsonPath}\``)
  }

  if (packageInfo) {
    lines.push(`Scripts: ${formatInlineList(packageInfo.scripts)}`)
    lines.push(`Dependencies: ${formatInlineList(packageInfo.dependencies)}`)
    lines.push(`Files whitelist: ${formatInlineList(packageInfo.files)}`)
    lines.push(`Executable bins: ${formatPackageBins(packageInfo.raw.bin)}`)
    lines.push(`Entry points: ${formatPackageEntrypoints(packageInfo.raw)}`)
    lines.push(`Exports: ${formatPackageExports(packageInfo.raw.exports)}`)
  }

  return lines
}

function formatInlineList(values: string[]): string {
  return values.length > 0 ? values.map(value => `\`${value}\``).join(', ') : 'None observed.'
}

function isLikelyEntryPoint(path: string): boolean {
  return /(^|\/)(package\.json|README\.md|index\.(js|jsx|ts|tsx)|main\.(js|ts)|cli\.(js|ts)|jsx-runtime\.(js|ts))$/i.test(
    path
  )
}

function isRouteLikeFile(path: string): boolean {
  return /(^|\/)(api|routes|pages|app)\//.test(path) && /\.(ts|tsx|js|jsx|py|rb|go)$/.test(path)
}

function fileExtension(path: string): string {
  const fileName = path.split('/').at(-1) ?? path
  return fileName.includes('.') ? `.${fileName.split('.').at(-1)}` : fileName
}

function moduleGroup(path: string, units: WorkspaceUnit[] = []): string {
  const unit = units
    .filter(candidate => path === candidate.path || path.startsWith(`${candidate.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (unit) {
    return unit.path
  }

  const parts = path.split('/')
  if (parts.length === 1) {
    return 'root'
  }

  if ((parts[0] === 'packages' || parts[0] === 'apps' || parts[0] === 'libs') && parts[1]) {
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
  return group
    .split('/')
    .map(part => Git.identity(part.replace(/^\.+/, '') || 'root'))
    .join('.')
}

function fileSourceReferences(target: ScanTarget, file: SourceFile, packageId?: string): SourceReference[] {
  const references = [createSourceReference(target, file.path, undefined, undefined, undefined, packageId)]
  for (const symbol of file.symbolRefs.slice(0, 20)) {
    references.push(createSourceReference(target, file.path, symbol.line, symbol.line, symbol.name, packageId))
  }

  return references
}

function createSourceReference(
  target: ScanTarget,
  path: string,
  startLine?: number,
  endLine?: number,
  symbolName?: string,
  packageId?: string
): SourceReference {
  const reference: SourceReference = {
    commit: target.commit,
    path,
    projectId: target.project.id
  }

  if (startLine !== undefined) {
    reference.startLine = startLine
  }

  if (endLine !== undefined) {
    reference.endLine = endLine
  }

  if (symbolName) {
    reference.symbolName = symbolName
  }

  if (packageId) {
    reference.packageId = packageId
  }

  const externalUrl = githubSourceUrl(target.project.repo, target.commit, path, startLine)
  if (externalUrl) {
    reference.externalUrl = externalUrl
  }

  return reference
}

function formatSourceRefs(references: SourceReference[]): string[] {
  return uniq(references.map(formatSourceReference)).sort((a, b) => a.localeCompare(b))
}

function formatSourceReference(reference: SourceReference): string {
  const line = reference.startLine ? `#L${reference.startLine}` : ''
  return `${reference.path}${line}`
}

function compareSourceReference(a: SourceReference, b: SourceReference): number {
  return formatSourceReference(a).localeCompare(formatSourceReference(b))
}

function githubSourceUrl(repo: string | undefined, commit: string, path: string, line?: number): string | undefined {
  const repository = parseGitHubRepository(repo)
  if (!repository || path === '.' || path === 'index.json') {
    return undefined
  }

  const suffix = line ? `#L${line}` : ''
  return `https://github.com/${repository.owner}/${repository.name}/blob/${commit}/${path}${suffix}`
}

function parseGitHubRepository(repo: string | undefined): { name: string; owner: string } | undefined {
  if (!repo) {
    return undefined
  }

  const httpsMatch = repo.match(/^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/)
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return {
      name: httpsMatch[2],
      owner: httpsMatch[1]
    }
  }

  const sshMatch = repo.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshMatch?.[1] && sshMatch[2]) {
    return {
      name: sshMatch[2],
      owner: sshMatch[1]
    }
  }

  const sshUrlMatch = repo.match(/^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (sshUrlMatch?.[1] && sshUrlMatch[2]) {
    return {
      name: sshUrlMatch[2],
      owner: sshUrlMatch[1]
    }
  }

  return undefined
}

function diagramNode(id: string, label: string, kind: DiagramNodeKind, sourceRefs: SourceReference[]) {
  return {
    id: diagramId(id),
    kind,
    label,
    sourceRefs
  }
}

function diagramEdge(from: string, to: string, kind: DiagramEdgeKind, sourceRefs: SourceReference[]) {
  return {
    from: diagramId(from),
    kind,
    sourceRefs,
    to: diagramId(to)
  }
}

function diagramDocument(
  target: ScanTarget,
  id: string,
  title: string,
  kind: DiagramDocument['kind'],
  nodes: ReturnType<typeof diagramNode>[],
  edges: ReturnType<typeof diagramEdge>[]
): DiagramDocument {
  return {
    commit: target.commit,
    edges: edges.filter(edge => nodes.some(node => node.id === edge.from) && nodes.some(node => node.id === edge.to)),
    id,
    kind,
    mermaidPath: `diagrams/${id}.mmd`,
    nodes,
    title
  }
}

function renderMermaid(document: DiagramDocument): string {
  const lines = ['flowchart TD']
  for (const node of document.nodes) {
    lines.push(`  ${node.id}["${escapeMermaidLabel(node.label)}"]`)
  }

  for (const edge of document.edges) {
    lines.push(`  ${edge.from} -->|${edge.kind}| ${edge.to}`)
  }

  return `${lines.join('\n')}\n`
}

function diagramId(input: string): string {
  return `n_${input.replace(/[^A-Za-z0-9_]/g, '_')}`
}

function escapeMermaidLabel(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function resolveRelativeImportPath(
  fromPath: string,
  importSpecifier: string,
  sourceFiles: SourceFile[]
): string | undefined {
  if (!importSpecifier.startsWith('.')) {
    return undefined
  }

  const fromDir = dirname(fromPath)
  const base = normalizePath(join(fromDir, importSpecifier))
  const sourcePaths = new Set(sourceFiles.map(file => file.path))
  const candidates = [
    base,
    ...[...sourceExtensions].map(extension => `${base}${extension}`),
    ...[...sourceExtensions].map(extension => `${base}/index${extension}`)
  ]

  return candidates.find(candidate => sourcePaths.has(candidate))
}

function normalizePath(path: string): string {
  return path.split('/').filter(Boolean).join('/')
}

function parseJsonConfigObject(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(stripJsonTrailingCommas(stripJsonComments(raw)))
  return isRecord(parsed) ? parsed : {}
}

function stripJsonComments(input: string): string {
  let output = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      output += char
      continue
    }

    if (char === '/' && next === '/') {
      while (index < input.length && input[index] !== '\n') {
        index += 1
      }
      if (index < input.length) {
        output += '\n'
      }
      continue
    }

    if (char === '/' && next === '*') {
      index += 2
      while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) {
        if (input[index] === '\n') {
          output += '\n'
        }
        index += 1
      }
      index += 1
      continue
    }

    output += char
  }

  return output
}

function stripJsonTrailingCommas(input: string): string {
  let output = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      output += char
      continue
    }

    if (char === ',') {
      let cursor = index + 1
      while (cursor < input.length && /\s/.test(input[cursor] ?? '')) {
        cursor += 1
      }
      if (input[cursor] === '}' || input[cursor] === ']') {
        continue
      }
    }

    output += char
  }

  return output
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

function collectPackageScripts(packageJson: Record<string, unknown>): string[] {
  if (!isRecord(packageJson.scripts)) {
    return []
  }

  return Object.keys(packageJson.scripts).sort((a, b) => a.localeCompare(b))
}

function collectPackageFiles(packageJson: Record<string, unknown>): string[] {
  if (!Array.isArray(packageJson.files)) {
    return []
  }

  return packageJson.files
    .filter((value): value is string => typeof value === 'string')
    .sort((a, b) => a.localeCompare(b))
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

function formatPackageEntrypoints(packageJson: Record<string, unknown>): string {
  const entries = new Set<string>()
  for (const key of ['main', 'module', 'types', 'typings', 'browser']) {
    const value = packageJson[key]
    if (typeof value === 'string') {
      entries.add(`${key}: ${value}`)
    }
  }

  return entries.size > 0 ? [...entries].sort((a, b) => a.localeCompare(b)).join(', ') : 'none'
}

function formatPackageExports(exportsValue: unknown): string {
  if (typeof exportsValue === 'string') {
    return exportsValue
  }

  if (!isRecord(exportsValue)) {
    return 'none'
  }

  const keys = Object.keys(exportsValue).sort((a, b) => a.localeCompare(b))
  return keys.length > 0 ? keys.join(', ') : 'none'
}
