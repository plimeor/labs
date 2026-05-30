import { describe, expect, test } from 'bun:test'
import { createCipheriv, createHash } from 'node:crypto'

import { cookieVersion, decryptCookieValue } from '../src/chrome/crypto'

// Chrome's fixed CBC IV (16 spaces). Any 16-byte key works here — the production
// key derivation (Keychain / keyring) is platform/external and out of scope.
const IV = Buffer.alloc(16, 0x20)
const KEY = Buffer.alloc(16, 0x07)

function encrypt(prefix: string, plaintext: Buffer, key = KEY): Buffer {
  const cipher = createCipheriv('aes-128-cbc', key, IV)
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([Buffer.from(prefix, 'latin1'), body])
}

describe('cookieVersion', () => {
  test('recognizes the v10 and v11 prefixes', () => {
    expect(cookieVersion(Buffer.from('v10payload'))).toBe('v10')
    expect(cookieVersion(Buffer.from('v11payload'))).toBe('v11')
  })

  test('returns undefined for legacy, unknown, or empty values', () => {
    expect(cookieVersion(Buffer.from('v12payload'))).toBeUndefined()
    expect(cookieVersion(Buffer.from('plaintext'))).toBeUndefined()
    expect(cookieVersion(Buffer.alloc(0))).toBeUndefined()
  })
})

describe('decryptCookieValue', () => {
  test('round-trips v10 and v11 values with the matching key', () => {
    expect(decryptCookieValue(encrypt('v10', Buffer.from('session=abc')), '.x.com', KEY)).toBe('session=abc')
    expect(decryptCookieValue(encrypt('v11', Buffer.from('hello world')), '.x.com', KEY)).toBe('hello world')
  })

  test('strips the SHA256(host_key) domain prefix that recent Chrome prepends', () => {
    const host = '.example.com'
    const plaintext = Buffer.concat([createHash('sha256').update(host).digest(), Buffer.from('value')])
    expect(decryptCookieValue(encrypt('v10', plaintext), host, KEY)).toBe('value')
  })

  test('keeps the leading bytes when the domain hash does not match the host', () => {
    const plaintext = Buffer.concat([createHash('sha256').update('.a.com').digest(), Buffer.from('value')])
    const result = decryptCookieValue(encrypt('v10', plaintext), '.b.com', KEY)
    expect(result).not.toBe('value')
    expect(result.endsWith('value')).toBe(true)
  })

  test('returns non-versioned bytes as UTF-8 (legacy plaintext)', () => {
    expect(decryptCookieValue(Buffer.from('legacy-plain'), '.x.com', KEY)).toBe('legacy-plain')
  })

  test('returns an empty string for an empty buffer', () => {
    expect(decryptCookieValue(Buffer.alloc(0), '.x.com', KEY)).toBe('')
  })
})
