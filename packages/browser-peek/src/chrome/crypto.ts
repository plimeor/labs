import { createDecipheriv, createHash, pbkdf2Sync } from 'node:crypto'

import { BrowserPeekError } from '../types'
import { getSafeStoragePassword } from './keychain'
import { getKeyringPassword } from './secret'

const SALT = 'saltysalt'
const KEY_LENGTH = 16
const IV = Buffer.alloc(16, 0x20)
const VERSION_PREFIXES = new Set(['v10', 'v11'])
// Chrome's hardcoded fallback password on Linux when no system keyring is present.
const LINUX_FALLBACK_PASSWORD = 'peanuts'
// PBKDF2 iteration count differs by platform.
const MAC_ITERATIONS = 1003
const LINUX_ITERATIONS = 1

/**
 * AES keys for the cookie value-encryption versions Chrome uses, indexed by the
 * `v1x` prefix on the encrypted blob. macOS only ever produces `v10`; Linux uses
 * `v11` (system keyring) and `v10` (hardcoded fallback).
 */
export type CookieKeys = {
  v10?: Buffer
  v11?: Buffer
}

let keysPromise: Promise<CookieKeys> | undefined

/**
 * Resolves the platform's cookie-decryption keys once (cached). Throws
 * `BrowserPeekError` when key material can't be obtained (e.g. a denied macOS
 * Keychain prompt) or the platform isn't supported, so callers can surface one
 * actionable failure instead of silently blanking every cookie value.
 */
export function getCookieKeys(): Promise<CookieKeys> {
  if (!keysPromise) {
    keysPromise = resolveCookieKeys()
  }
  return keysPromise
}

async function resolveCookieKeys(): Promise<CookieKeys> {
  if (process.platform === 'darwin') {
    const password = await getSafeStoragePassword()
    return { v10: deriveKey(password, MAC_ITERATIONS) }
  }

  if (process.platform === 'linux') {
    const keys: CookieKeys = { v10: deriveKey(LINUX_FALLBACK_PASSWORD, LINUX_ITERATIONS) }
    const keyring = await getKeyringPassword()
    if (keyring !== undefined) {
      keys.v11 = deriveKey(keyring, LINUX_ITERATIONS)
    }
    return keys
  }

  throw new BrowserPeekError(
    `Reading Chrome cookies is not supported on ${process.platform}; it works on macOS and Linux. ` +
      'Local storage is available on this platform.'
  )
}

function deriveKey(password: string, iterations: number): Buffer {
  return pbkdf2Sync(password, SALT, iterations, KEY_LENGTH, 'sha1')
}

/** The `v1x` version of an encrypted cookie blob, or `undefined` for legacy plaintext. */
export function cookieVersion(encrypted: Buffer): keyof CookieKeys | undefined {
  const prefix = encrypted.subarray(0, 3).toString('latin1')
  return VERSION_PREFIXES.has(prefix) ? (prefix as keyof CookieKeys) : undefined
}

/**
 * Decrypts a Chrome cookie value with the matching `CookieKeys` entry. `v10`/`v11`
 * values are AES-128-CBC encrypted; recent Chrome (M130+) prepends
 * `SHA256(host_key)` to the plaintext to bind the cookie to its domain, which is
 * stripped when present. Non-versioned values are returned as-is.
 */
export function decryptCookieValue(encrypted: Buffer, hostKey: string, key: Buffer): string {
  if (encrypted.length === 0) {
    return ''
  }

  if (!cookieVersion(encrypted)) {
    return encrypted.toString('utf8')
  }

  const decipher = createDecipheriv('aes-128-cbc', key, IV)
  const decrypted = Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()])
  return stripDomainHash(decrypted, hostKey).toString('utf8')
}

function stripDomainHash(decrypted: Buffer, hostKey: string): Buffer {
  if (decrypted.length < 32) {
    return decrypted
  }

  const expected = createHash('sha256').update(hostKey).digest()
  if (decrypted.subarray(0, 32).equals(expected)) {
    return decrypted.subarray(32)
  }

  return decrypted
}
