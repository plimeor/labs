import { afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { tempDir } from '../helpers/fs.js'
import { withCwd } from '../helpers/process.js'

type ConfirmOptions = {
  message: string
}

type MultiselectOptions = {
  initialValues?: string[]
  options: Array<{
    hint?: string
    label: string
    value: string
  }>
}

const confirmCalls: ConfirmOptions[] = []
const multiselectCalls: MultiselectOptions[] = []
const runtimePrompts: string[] = []
let confirmResult: boolean | symbol = false
let multiselectResult: string[] | symbol = ['platform']
let reviewOutput = [
  '## Code-level objective',
  'Update the selected project.',
  '',
  '## Missing requirements',
  'Clarify rollout.',
  '',
  '## Project plans',
  'Use the routed wiki context.',
  '',
  '## Integration plan',
  'Coordinate contracts.',
  '',
  '## Regression scope',
  'Run focused checks.',
  '',
  '## Open questions',
  'Who approves release?'
].join('\n')

mock.module('@clack/prompts', () => ({
  cancel: () => undefined,
  confirm: async (options: ConfirmOptions) => {
    confirmCalls.push(options)
    return confirmResult
  },
  isCancel: (value: unknown) => typeof value === 'symbol',
  log: {
    info: () => undefined,
    success: () => undefined
  },
  multiselect: async (options: MultiselectOptions) => {
    multiselectCalls.push(options)
    return multiselectResult
  }
}))

mock.module('../../src/runtime/index.js', () => ({
  assertRuntimeAvailable: async () => undefined,
  runRuntime: async ({ prompt }: { prompt: string }) => {
    runtimePrompts.push(prompt)
    if (prompt.includes('selecting affected projects')) {
      return '{"projects":[{"id":"web-app","reason":"PRD mentions web billing."}]}'
    }

    return reviewOutput
  }
}))

const { reviewCommand } = await import('../../src/commands/review.js')

afterEach(() => {
  confirmCalls.length = 0
  multiselectCalls.length = 0
  runtimePrompts.length = 0
  confirmResult = false
  multiselectResult = ['platform']
  reviewOutput = [
    '## Code-level objective',
    'Update the selected project.',
    '',
    '## Missing requirements',
    'Clarify rollout.',
    '',
    '## Project plans',
    'Use the routed wiki context.',
    '',
    '## Integration plan',
    'Coordinate contracts.',
    '',
    '## Regression scope',
    'Run focused checks.',
    '',
    '## Open questions',
    'Who approves release?'
  ].join('\n')
})

describe('review command', () => {
  test('requires confirmation and respects edited shared project selection', async () => {
    const cwd = await tempDir('code-wiki-review-')
    await writeSharedWorkspace(cwd)
    await withTemporaryTty(() =>
      withCwd(cwd, () =>
        reviewCommand({
          args: { prd: 'prd.md' },
          options: {}
        })
      )
    )

    expect(confirmCalls).toHaveLength(1)
    expect(multiselectCalls).toHaveLength(1)
    expect(multiselectCalls[0].initialValues).toEqual(['web-app'])
    expect(runtimePrompts).toHaveLength(2)
    expect(runtimePrompts[1]).toContain('Project: platform')
    expect(runtimePrompts[1]).not.toContain('Project: web-app')

    const reports = await readdir(join(cwd, '.code-wiki', 'reports'))
    expect(reports).toHaveLength(1)
    const report = await Bun.file(join(cwd, '.code-wiki', 'reports', reports[0])).text()
    expect(report).toContain('Projects: platform')
    expect(report).toContain('## Code-level objective')
  })

  test('fails instead of writing a report when runtime output misses required sections', async () => {
    const cwd = await tempDir('code-wiki-review-invalid-')
    await writeSharedWorkspace(cwd)
    confirmResult = true
    reviewOutput = '## Project plans\nOnly partial output.\n'

    await expect(
      withTemporaryTty(() =>
        withCwd(cwd, () =>
          reviewCommand({
            args: { prd: 'prd.md' },
            options: {}
          })
        )
      )
    ).rejects.toThrow('Runtime review output is missing required sections')

    expect(await readdir(join(cwd, '.code-wiki', 'reports'))).toEqual([])
  })
})

async function writeSharedWorkspace(cwd: string): Promise<void> {
  await mkdir(join(cwd, '.code-wiki', 'projects', 'web-app'), { recursive: true })
  await mkdir(join(cwd, '.code-wiki', 'projects', 'platform'), { recursive: true })
  await mkdir(join(cwd, '.code-wiki', 'reports'), { recursive: true })
  await writeFile(join(cwd, 'prd.md'), 'Add billing controls to the platform.\n')
  await writeFile(join(cwd, '.code-wiki', 'config.json'), '{"mode":"shared","runtime":"codex","schemaVersion":1}\n')
  await writeFile(
    join(cwd, '.code-wiki', 'projects.json'),
    JSON.stringify(
      {
        projects: [projectEntry('platform'), projectEntry('web-app')],
        schemaVersion: 1
      },
      null,
      2
    )
  )
  await writeProjectWiki(cwd, 'web-app', 'Web App')
  await writeProjectWiki(cwd, 'platform', 'Platform')
}

function projectEntry(id: string) {
  return {
    defaultBranch: 'HEAD',
    displayName: id,
    id,
    managedRepoPath: join('.code-wiki', 'repos', id),
    repoUrl: `git@github.com:org/${id}.git`,
    wikiPath: join('.code-wiki', 'projects', id)
  }
}

async function writeProjectWiki(cwd: string, id: string, title: string): Promise<void> {
  const root = join(cwd, '.code-wiki', 'projects', id)
  await writeFile(
    join(root, 'index.json'),
    JSON.stringify(
      {
        commit: 'abc123',
        projectId: id,
        schemaVersion: 1,
        pages: [
          {
            authority: 'generated',
            contentHash: 'sha256:test',
            id: 'overview',
            kind: 'overview',
            lastScannedCommit: 'abc123',
            path: 'overview.md',
            sourceRefs: ['**/*'],
            summary: `${title} overview`,
            symbols: [],
            title
          }
        ]
      },
      null,
      2
    )
  )
  await writeFile(
    join(root, 'metadata.json'),
    JSON.stringify({
      branch: 'main',
      lastScannedAt: '2026-05-01T00:00:00.000Z',
      lastScannedCommit: 'abc123',
      projectId: id,
      repoUrl: `git@github.com:org/${id}.git`,
      schemaVersion: 1
    })
  )
  await writeFile(join(root, 'index.md'), `# ${title} Index\n`)
  await writeFile(join(root, 'overview.md'), `# ${title}\n`)
}

async function withTemporaryTty<T>(callback: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
  Object.defineProperty(process.stdin, 'isTTY', {
    configurable: true,
    value: true
  })
  try {
    return await callback()
  } finally {
    if (descriptor) {
      Object.defineProperty(process.stdin, 'isTTY', descriptor)
    } else {
      delete (process.stdin as { isTTY?: boolean }).isTTY
    }
  }
}
