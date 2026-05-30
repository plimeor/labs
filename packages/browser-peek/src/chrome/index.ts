import { Database } from 'bun:sqlite'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { withTempCopy } from '../shared/temp'
import { type BrowserAdapter, BrowserPeekError, type CookieMeta, type Profile, type StoreRecord } from '../types'
import { type CookieKeys, cookieVersion, decryptCookieValue, getCookieKeys } from './crypto'
import { readLevelDb } from './localstorage'

const COOKIE_RELATIVE_PATHS = ['Network/Cookies', 'Cookies']

function chromeBaseDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library/Application Support/Google/Chrome')
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    return join(localAppData, 'Google', 'Chrome', 'User Data')
  }
  return join(homedir(), '.config', 'google-chrome')
}

const BASE = chromeBaseDir()

type LocalState = {
  profile?: {
    info_cache?: Record<string, { name?: string }>
    last_used?: string
  }
}

type CookieRow = {
  host_key: string
  name: string
  value: string | null
  encrypted_value: Uint8Array | null
  path: string | null
  expires_utc: number
  is_secure: number
  is_httponly: number
  samesite: number
}

async function listProfiles(): Promise<Profile[]> {
  let state: LocalState
  try {
    state = JSON.parse(await readFile(join(BASE, 'Local State'), 'utf8'))
  } catch {
    throw new BrowserPeekError(`Chrome data not found at ${BASE}. Is Google Chrome installed?`)
  }

  const cache = state.profile?.info_cache ?? {}
  const lastUsed = state.profile?.last_used ?? 'Default'
  const profiles = Object.entries(cache).map(([dir, info]) => ({
    id: dir,
    isDefault: dir === lastUsed,
    name: info.name ?? dir,
    path: join(BASE, dir)
  }))

  if (profiles.length === 0) {
    return [{ id: 'Default', isDefault: true, name: 'Default', path: join(BASE, 'Default') }]
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name))
}

async function defaultProfile(): Promise<Profile | undefined> {
  const profiles = await listProfiles()
  return profiles.find(profile => profile.isDefault) ?? profiles[0]
}

async function findCookieDb(profile: Profile): Promise<string | undefined> {
  for (const relative of COOKIE_RELATIVE_PATHS) {
    const candidate = join(profile.path, relative)
    if (await Bun.file(candidate).exists()) {
      return candidate
    }
  }
  return undefined
}

async function readCookies(profile: Profile): Promise<StoreRecord[]> {
  const dbPath = await findCookieDb(profile)
  if (!dbPath) {
    return []
  }

  return withTempCopy(dbPath, 'file', async copyPath => {
    const db = new Database(copyPath, { readonly: true })
    try {
      const rows = db
        .query(
          'SELECT host_key, name, value, encrypted_value, path, expires_utc, is_secure, is_httponly, samesite FROM cookies'
        )
        .all() as CookieRow[]

      // Resolve the platform's decryption key(s) once up front. An unsupported
      // platform, a denied macOS Keychain prompt, or a missing Linux keyring key
      // throws here and propagates as one actionable failure, instead of being
      // swallowed per row into silently blank values.
      const keys: CookieKeys = rows.some(hasEncryptedValue) ? await getCookieKeys() : {}
      ensureKeysAvailable(rows, keys)

      return rows.map(row => ({
        browser: 'chrome' as const,
        meta: cookieMeta(row),
        name: row.name,
        origin: row.host_key,
        profile: profile.id,
        store: 'cookie' as const,
        value: decodeCookieValue(row, keys)
      }))
    } finally {
      db.close()
    }
  })
}

function hasEncryptedValue(row: CookieRow): row is CookieRow & { encrypted_value: Uint8Array } {
  return row.encrypted_value !== null && row.encrypted_value.length > 0
}

function ensureKeysAvailable(rows: CookieRow[], keys: CookieKeys): void {
  const missing = new Set<keyof CookieKeys>()
  for (const row of rows) {
    if (!hasEncryptedValue(row)) {
      continue
    }
    const version = cookieVersion(Buffer.from(row.encrypted_value))
    if (version && !keys[version]) {
      missing.add(version)
    }
  }

  if (missing.has('v11')) {
    throw new BrowserPeekError(
      'Could not read the "Chrome Safe Storage" key from the system keyring (GNOME Keyring / KWallet). ' +
        'Install `secret-tool` (libsecret) and unlock your login keyring, then try again.'
    )
  }
  if (missing.size > 0) {
    throw new BrowserPeekError('Could not derive the Chrome cookie decryption key.')
  }
}

function decodeCookieValue(row: CookieRow, keys: CookieKeys): string {
  if (!hasEncryptedValue(row)) {
    return row.value ?? ''
  }

  const encrypted = Buffer.from(row.encrypted_value)
  const version = cookieVersion(encrypted)
  if (!version) {
    return encrypted.toString('utf8')
  }

  const key = keys[version]
  if (!key) {
    return ''
  }

  try {
    return decryptCookieValue(encrypted, row.host_key, key)
  } catch {
    // A single corrupt or foreign blob shouldn't blank the rest of the store.
    return ''
  }
}

function cookieMeta(row: CookieRow): CookieMeta {
  return {
    expires: chromeTimeToIso(row.expires_utc),
    httpOnly: row.is_httponly === 1,
    kind: 'cookie',
    path: row.path ?? undefined,
    sameSite: sameSiteLabel(row.samesite),
    secure: row.is_secure === 1
  }
}

function sameSiteLabel(value: number): CookieMeta['sameSite'] {
  if (value === 0) {
    return 'none'
  }
  if (value === 1) {
    return 'lax'
  }
  if (value === 2) {
    return 'strict'
  }
  return 'unspecified'
}

function chromeTimeToIso(expiresUtc: number): string | undefined {
  if (!expiresUtc) {
    return undefined
  }

  // expires_utc is microseconds since 1601-01-01 UTC.
  const unixMs = expiresUtc / 1000 - 11644473600000
  if (!Number.isFinite(unixMs) || unixMs <= 0) {
    return undefined
  }
  return new Date(unixMs).toISOString()
}

async function readLocalStorage(profile: Profile): Promise<StoreRecord[]> {
  const leveldbDir = join(profile.path, 'Local Storage', 'leveldb')
  if (!(await Bun.file(join(leveldbDir, 'CURRENT')).exists())) {
    return []
  }

  const entries = await readLevelDb(leveldbDir)
  return entries.map(entry => ({
    browser: 'chrome' as const,
    meta: { kind: 'local-storage' as const },
    name: entry.key,
    origin: entry.origin,
    profile: profile.id,
    store: 'local-storage' as const,
    value: entry.value
  }))
}

export const chromeAdapter: BrowserAdapter = {
  capabilities: { cookies: true, localStorage: true },
  displayName: 'Google Chrome',
  id: 'chrome',
  listProfiles,
  defaultProfile,
  readCookies,
  readLocalStorage
}
