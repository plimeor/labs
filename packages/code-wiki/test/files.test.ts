import { describe, expect, test } from 'bun:test'
import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Files } from '../src/files.js'
import { tempDir } from './helpers/fs.js'

describe('Files', () => {
  test('classifies missing paths consistently', async () => {
    const cwd = await tempDir('code-wiki-files-missing-')
    const missingPath = join(cwd, 'missing.txt')

    expect(await Files.pathExists(missingPath)).toBe(false)

    try {
      await Files.statPath(missingPath)
      throw new Error('Expected statPath to throw for a missing path')
    } catch (error) {
      expect(Files.errorKind(error)).toBe(Files.ErrorKind.NotFound)
      expect(Files.isNotFound(error)).toBe(true)
    }
  })

  test('treats directories as existing paths and exposes directory stats', async () => {
    const cwd = await tempDir('code-wiki-files-directory-')
    const directoryPath = join(cwd, 'state')
    await Files.ensureDir(directoryPath)

    expect(await Files.pathExists(directoryPath)).toBe(true)
    expect((await Files.statPath(directoryPath)).isDirectory()).toBe(true)
  })

  test('classifies readlink on a regular file as not symbolic link', async () => {
    const cwd = await tempDir('code-wiki-files-readlink-')
    const filePath = join(cwd, 'regular.txt')
    await writeFile(filePath, 'regular\n')

    try {
      await Files.readSymbolicLink(filePath)
      throw new Error('Expected readSymbolicLink to throw for a regular file')
    } catch (error) {
      expect(Files.errorKind(error)).toBe(Files.ErrorKind.NotSymbolicLink)
      expect(Files.isNotSymbolicLinkReadError(error)).toBe(true)
    }
  })

  test('reads and writes text through Bun file APIs', async () => {
    const cwd = await tempDir('code-wiki-files-text-')
    const filePath = join(cwd, 'nested', 'state.txt')

    await Files.writeText(filePath, 'state\n')

    expect(await Files.readText(filePath)).toBe('state\n')
    expect(await Files.pathExists(filePath)).toBe(true)
  })

  test('reads and writes stable JSON', async () => {
    const cwd = await tempDir('code-wiki-files-json-')
    const filePath = join(cwd, 'state.json')

    await Files.writeJson(filePath, { a: { b: 3, y: 2 }, z: 1 })

    expect(await Files.readText(filePath)).toBe('{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}\n')
    expect(await Files.readJson(filePath, input => input)).toEqual({ a: { b: 3, y: 2 }, z: 1 })
  })

  test('writes through absolute symlinks without replacing the link', async () => {
    const cwd = await tempDir('code-wiki-files-symlink-')
    const linkPath = join(cwd, 'state.json')
    const targetPath = join(cwd, 'real', 'state.json')
    await symlink(targetPath, linkPath)

    await Files.writeText(linkPath, 'linked content\n')

    expect(await readFile(targetPath, 'utf-8')).toBe('linked content\n')
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true)
  })

  test('writes through relative symlinks relative to the link directory', async () => {
    const cwd = await tempDir('code-wiki-files-relative-symlink-')
    const linkDir = join(cwd, 'links')
    const linkPath = join(linkDir, 'state.json')
    const targetPath = join(cwd, 'real', 'state.json')
    await mkdir(linkDir, { recursive: true })
    await symlink('../real/state.json', linkPath)

    await Files.writeText(linkPath, 'relative linked content\n')

    expect(await Files.readSymbolicLink(linkPath)).toBe('../real/state.json')
    expect(await readFile(targetPath, 'utf-8')).toBe('relative linked content\n')
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true)
  })

  test('creates temporary directories and removes paths recursively', async () => {
    const cwd = await tempDir('code-wiki-files-remove-')
    const temp = await Files.makeTempDir({ directory: cwd, prefix: 'workspace-' })
    const filePath = join(temp, 'nested', 'state.txt')
    await Files.writeText(filePath, 'temporary\n')

    expect(await Files.readDir(join(temp, 'nested'))).toEqual(['state.txt'])

    await Files.removePath(temp, { recursive: true })

    expect(await Files.pathExists(temp)).toBe(false)
  })
})
