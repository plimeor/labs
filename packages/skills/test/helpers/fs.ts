import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Lock } from '../../src/lock.js'
import { Manifest } from '../../src/manifest.js'

export async function tempDir(prefix: string): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix))
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8'))
}

export async function writeGlobalManifest(home: string, manifest: Manifest.Document): Promise<string> {
  const manifestPath = join(home, '.agents', 'skills.json')
  await Manifest.write(manifestPath, manifest)
  return manifestPath
}

export async function writeGlobalLock(home: string, lock: Lock.Document): Promise<string> {
  const lockPath = join(home, '.agents', 'skills.lock.json')
  await Lock.write(lockPath, lock)
  return lockPath
}

export async function writeProjectManifest(cwd: string, manifest: Manifest.Document): Promise<string> {
  const manifestPath = join(cwd, '.agents', 'skills.json')
  await Manifest.write(manifestPath, manifest)
  return manifestPath
}

export async function writeProjectLock(cwd: string, lock: Lock.Document): Promise<string> {
  const lockPath = join(cwd, '.agents', 'skills.lock.json')
  await Lock.write(lockPath, lock)
  return lockPath
}
