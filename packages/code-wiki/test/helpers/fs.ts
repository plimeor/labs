import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix))
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf-8'))
}

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf-8')
}
