import { describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { initCommand } from '../../src/commands/init.js'
import { scanCommand } from '../../src/commands/scan.js'
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
})
