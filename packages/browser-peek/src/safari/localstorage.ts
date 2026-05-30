import { Database } from 'bun:sqlite'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { withTempCopy } from '../shared/temp'
import { fullDiskAccessError, isPermissionError } from './access'

export type SafariLocalEntry = {
  origin: string
  key: string
  value: string
}

const LOCAL_STORAGE_ROOTS = [
  join(homedir(), 'Library/Containers/com.apple.Safari/Data/Library/WebKit/WebsiteData/LocalStorage'),
  join(homedir(), 'Library/Safari/LocalStorage')
]

type ItemRow = {
  key: string
  value: Uint8Array | string | null
}

export async function readSafariLocalStorage(): Promise<SafariLocalEntry[]> {
  const entries: SafariLocalEntry[] = []
  for (const root of LOCAL_STORAGE_ROOTS) {
    for (const file of await listLocalStorageFiles(root)) {
      entries.push(...(await readLocalStorageFile(root, file)))
    }
  }
  return entries
}

async function listLocalStorageFiles(root: string): Promise<string[]> {
  try {
    const names = await readdir(root)
    return names.filter(name => name.endsWith('.localstorage'))
  } catch (error) {
    if (isMissing(error)) {
      return []
    }
    if (isPermissionError(error)) {
      throw fullDiskAccessError()
    }
    throw error
  }
}

async function readLocalStorageFile(root: string, file: string): Promise<SafariLocalEntry[]> {
  const origin = originFromFilename(file)
  try {
    return await withTempCopy(join(root, file), 'file', async copyPath => {
      const db = new Database(copyPath, { readonly: true })
      try {
        const rows = db.query('SELECT key, value FROM ItemTable').all() as ItemRow[]
        return rows.map(row => ({ origin, key: row.key, value: decodeValue(row.value) }))
      } finally {
        db.close()
      }
    })
  } catch (error) {
    if (isPermissionError(error)) {
      throw fullDiskAccessError()
    }
    // A single unreadable origin file should not abort the whole read.
    return []
  }
}

function decodeValue(value: Uint8Array | string | null): string {
  if (value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  // WebKit stores local-storage values as UTF-16LE blobs.
  return Buffer.from(value).toString('utf16le')
}

function originFromFilename(file: string): string {
  const base = file.replace(/\.localstorage$/, '')
  const match = base.match(/^([a-z]+)_(.+)_(\d+)$/i)
  if (!match) {
    return base
  }

  const [, scheme, host, port] = match
  const suffix = port && port !== '0' ? `:${port}` : ''
  return `${scheme}://${host}${suffix}`
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'
}
