export type BrowserId = 'chrome' | 'safari'

export type StoreType = 'cookie' | 'local-storage'

export type StoreSelector = StoreType | 'all'

export type Profile = {
  /** Stable identifier (directory name or profile UUID). */
  id: string
  /** Human-friendly name shown in the picker. */
  name: string
  /** Absolute path to the profile directory or data root. */
  path: string
  /** True for the browser's current/most-recently-used profile. */
  isDefault?: boolean
}

export type CookieMeta = {
  kind: 'cookie'
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'none' | 'lax' | 'strict' | 'unspecified'
  /** ISO timestamp, or undefined for a session cookie. */
  expires?: string
}

export type LocalStorageMeta = {
  kind: 'local-storage'
}

export type StoreRecord = {
  browser: BrowserId
  profile: string
  store: StoreType
  /** Cookie host (`host_key`) or local-storage origin/storage-key. */
  origin: string
  /** Cookie name or local-storage key. */
  name: string
  value: string
  meta: CookieMeta | LocalStorageMeta
}

export type ReadOptions = {
  /** Restrict to a single store, or read everything (default). */
  type?: StoreSelector
  /** Optional case-insensitive substring filter on `origin`. */
  domain?: string
}

export type Capabilities = {
  cookies: boolean
  localStorage: boolean
}

export type BrowserAdapter = {
  id: BrowserId
  displayName: string
  capabilities: Capabilities
  listProfiles(): Promise<Profile[]>
  defaultProfile(): Promise<Profile | undefined>
  readCookies(profile: Profile): Promise<StoreRecord[]>
  readLocalStorage(profile: Profile): Promise<StoreRecord[]>
}

/** Raised for expected, user-actionable failures (missing browser, denied access). */
export class BrowserPeekError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrowserPeekError'
  }
}
