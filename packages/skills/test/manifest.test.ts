import { describe, expect, test } from 'bun:test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Manifest } from '../src/manifest.js'
import type { Scope } from '../src/scope.js'
import { tempDir } from './helpers/fs.js'

describe('manifest parsing', () => {
  test('rejects unsupported schemaVersion and scope', async () => {
    await expect(readManifestFixture({ schemaVersion: 2, scope: 'global', skills: [] })).rejects.toThrow(
      'schemaVersion'
    )
    await expect(readManifestFixture({ schemaVersion: 1, scope: 'user', skills: [] })).rejects.toThrow('scope')
  })

  test('rejects missing source and duplicate skill names', async () => {
    await expect(readManifestFixture({ schemaVersion: 1, scope: 'global', skills: [{ name: 'a' }] })).rejects.toThrow(
      'source'
    )
    await expect(
      readManifestFixture({
        schemaVersion: 1,
        scope: 'global',
        skills: [
          { name: 'a', source: 'repo' },
          { name: 'a', source: 'other' }
        ]
      })
    ).rejects.toThrow('Duplicate')
  })

  test('serializes skills deterministically without volatile fields', async () => {
    const dir = await tempDir('skills-manifest-parse-')
    const file = join(dir, 'skills.json')
    await writeFile(
      file,
      JSON.stringify({
        installedAt: 'volatile',
        schemaVersion: 1,
        scope: 'global',
        skills: [
          { name: 'z', source: 'repo', updatedAt: 'volatile' },
          { name: 'a', path: 'skills/a', ref: 'main', skillFolderHash: 'volatile', source: 'repo' }
        ]
      })
    )
    await Manifest.write(file, await Manifest.read(file))
    const output = await readFile(file, 'utf-8')

    expect(output).toBe(`{
  "schemaVersion": 1,
  "scope": "global",
  "sources": [
    {
      "source": "repo",
      "skills": [
        {
          "name": "a",
          "path": "skills/a",
          "ref": "main"
        },
        {
          "name": "z"
        }
      ]
    }
  ]
}
`)
    expect(output).not.toContain('installedAt')
    expect(output).not.toContain('skillFolderHash')
  })
})

describe('manifest mutations', () => {
  test('upserts and removes skill entries', () => {
    let manifest = Manifest.createEmpty('global')
    manifest = Manifest.upsertSkill(manifest, { name: 'b', source: 'repo' })
    manifest = Manifest.upsertSkill(manifest, { name: 'a', path: 'skills/a', source: 'repo' })
    manifest = Manifest.upsertSkill(manifest, { commit: 'abc', name: 'a', path: 'skills/a', source: 'repo' })

    expect(manifest.skills).toEqual([
      { commit: 'abc', name: 'a', path: 'skills/a', source: 'repo' },
      { name: 'b', source: 'repo' }
    ])
    expect(Manifest.removeSkill(manifest, 'b').skills).toEqual([
      { commit: 'abc', name: 'a', path: 'skills/a', source: 'repo' }
    ])
  })

  test('ensures a missing manifest file with default deterministic content', async () => {
    const dir = await tempDir('skills-manifest-ensure-')
    const file = join(dir, 'nested', 'skills.json')

    await expect(Manifest.read(file)).rejects.toThrow()
    const manifest = await Manifest.ensure(manifestScope(file))

    expect(manifest).toEqual({ schemaVersion: 1, scope: 'project', skills: [], sources: [] })
    expect(await readFile(file, 'utf-8')).toBe(`{
  "schemaVersion": 1,
  "scope": "project",
  "sources": []
}
`)
  })
})

async function readManifestFixture(input: unknown): Promise<Manifest.Document> {
  const dir = await tempDir('skills-manifest-invalid-')
  const file = join(dir, 'skills.json')
  await writeFile(file, JSON.stringify(input))
  return await Manifest.read(file)
}

function manifestScope(manifestPath: string): Scope {
  const dir = join(manifestPath, '..')
  return {
    createGlobalDir: false,
    globalDir: dir,
    installDir: dir,
    lockPath: join(dir, 'skills.lock.json'),
    manifestPath,
    scope: 'project'
  }
}
