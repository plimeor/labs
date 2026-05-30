import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Level } from 'level'

import { chromeAdapter } from '../src/chrome'
import { readLevelDb } from '../src/chrome/localstorage'

function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'browser-peek-test-'))
}

function seedCookieDb(path: string): void {
  const db = new Database(path)
  db.run(
    'CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, ' +
      'path TEXT, expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER, samesite INTEGER)'
  )
  const insert = db.query('INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  // Plaintext values only: the encrypted path needs the platform key (Keychain /
  // keyring) and is covered at the unit level in crypto.test.ts. 13380163200000000
  // is 2025-01-01T00:00:00Z in Chrome's microseconds-since-1601 epoch.
  insert.run('.github.com', 'session', 'abc', null, '/', 13380163200000000, 1, 1, 2)
  insert.run('example.com', 'sess', '', null, '/app', 0, 0, 0, 0)
  db.close()
}

describe('chromeAdapter.readCookies', () => {
  test('maps rows to records with cookie metadata', async () => {
    const dir = await tempDir()
    try {
      await mkdir(join(dir, 'Network'), { recursive: true })
      seedCookieDb(join(dir, 'Network', 'Cookies'))

      const records = await chromeAdapter.readCookies({ id: 'Default', name: 'Default', path: dir })
      const byName = Object.fromEntries(records.map(record => [record.name, record]))

      expect(records).toHaveLength(2)
      expect(byName.session).toMatchObject({
        browser: 'chrome',
        origin: '.github.com',
        profile: 'Default',
        store: 'cookie',
        value: 'abc'
      })
      expect(byName.session.meta).toEqual({
        expires: '2025-01-01T00:00:00.000Z',
        httpOnly: true,
        kind: 'cookie',
        path: '/',
        sameSite: 'strict',
        secure: true
      })
      // A zero expiry is a session cookie; samesite 0 maps to 'none'.
      expect(byName.sess.meta).toMatchObject({
        expires: undefined,
        httpOnly: false,
        sameSite: 'none',
        secure: false
      })
      expect(byName.sess.value).toBe('')
    } finally {
      await rm(dir, { force: true, recursive: true })
    }
  })

  test('falls back to the legacy Cookies path, and returns [] when no db exists', async () => {
    const withLegacy = await tempDir()
    const empty = await tempDir()
    try {
      seedCookieDb(join(withLegacy, 'Cookies')) // no Network/ subdirectory
      const records = await chromeAdapter.readCookies({ id: 'p', name: 'p', path: withLegacy })
      expect(records.map(record => record.name).sort()).toEqual(['sess', 'session'])

      expect(await chromeAdapter.readCookies({ id: 'p', name: 'p', path: empty })).toEqual([])
    } finally {
      await rm(withLegacy, { force: true, recursive: true })
      await rm(empty, { force: true, recursive: true })
    }
  })
})

describe('readLevelDb (Chrome local storage)', () => {
  test('decodes origins, keys, UTF-16/Latin-1 values, and skips META keys', async () => {
    const root = await tempDir()
    const dbDir = join(root, 'leveldb')
    try {
      const db = new Level<Buffer, Buffer>(dbDir, { keyEncoding: 'buffer', valueEncoding: 'buffer' })
      await db.open()

      const origin = 'https://app.test'
      // Chrome key layout: _<origin>\x00<keyType><key>; keyType 0x01 => Latin-1.
      const keyPrefix = Buffer.concat([Buffer.from('_'), Buffer.from(origin), Buffer.from([0x00, 0x01])])
      // Value layout: <valueType><bytes>; 0x00 => UTF-16LE, 0x01 => Latin-1.
      await db.put(
        Buffer.concat([keyPrefix, Buffer.from('theme', 'latin1')]),
        Buffer.concat([Buffer.from([0x00]), Buffer.from('dark', 'utf16le')])
      )
      await db.put(
        Buffer.concat([keyPrefix, Buffer.from('lang', 'latin1')]),
        Buffer.concat([Buffer.from([0x01]), Buffer.from('en', 'latin1')])
      )
      // A META key (no leading underscore) must be skipped.
      await db.put(Buffer.from(`META:${origin}`), Buffer.from([0x00, 0x01]))
      await db.close()

      const entries = await readLevelDb(dbDir)
      const byKey = Object.fromEntries(entries.map(entry => [entry.key, entry]))

      expect(entries).toHaveLength(2)
      expect(byKey.theme).toEqual({ origin, key: 'theme', value: 'dark' })
      expect(byKey.lang).toEqual({ origin, key: 'lang', value: 'en' })
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
