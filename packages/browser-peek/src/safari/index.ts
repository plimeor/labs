import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { BrowserAdapter, CookieMeta, Profile, StoreRecord } from '../types'
import { fullDiskAccessError, isPermissionError } from './access'
import { parseBinaryCookies } from './binarycookies'
import { readSafariLocalStorage } from './localstorage'

const CONTAINER = join(homedir(), 'Library/Containers/com.apple.Safari/Data/Library')
const COOKIE_CANDIDATES = [
  join(CONTAINER, 'Cookies/Cookies.binarycookies'),
  join(homedir(), 'Library/Cookies/Cookies.binarycookies')
]

// Safari shares cookies and website data across the container; per-profile
// isolation (Safari 17+) is not yet enumerated here.
async function listProfiles(): Promise<Profile[]> {
  return [{ id: 'Default', isDefault: true, name: 'Default', path: CONTAINER }]
}

async function defaultProfile(): Promise<Profile | undefined> {
  const [profile] = await listProfiles()
  return profile
}

async function readCookies(profile: Profile): Promise<StoreRecord[]> {
  for (const candidate of COOKIE_CANDIDATES) {
    const buffer = await readCookieFile(candidate)
    if (!buffer) {
      continue
    }

    return parseBinaryCookies(buffer).map(cookie => ({
      browser: 'safari' as const,
      meta: {
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        kind: 'cookie',
        path: cookie.path,
        sameSite: 'unspecified',
        secure: cookie.secure
      } satisfies CookieMeta,
      name: cookie.name,
      origin: cookie.domain,
      profile: profile.id,
      store: 'cookie' as const,
      value: cookie.value
    }))
  }

  return []
}

async function readCookieFile(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path)
  } catch (error) {
    if (isPermissionError(error)) {
      throw fullDiskAccessError()
    }
    return undefined
  }
}

async function readLocalStorage(profile: Profile): Promise<StoreRecord[]> {
  const entries = await readSafariLocalStorage()
  return entries.map(entry => ({
    browser: 'safari' as const,
    meta: { kind: 'local-storage' as const },
    name: entry.key,
    origin: entry.origin,
    profile: profile.id,
    store: 'local-storage' as const,
    value: entry.value
  }))
}

export const safariAdapter: BrowserAdapter = {
  capabilities: { cookies: true, localStorage: true },
  displayName: 'Safari',
  id: 'safari',
  listProfiles,
  defaultProfile,
  readCookies,
  readLocalStorage
}
