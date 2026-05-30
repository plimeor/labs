import { describe, expect, test } from 'bun:test'

import { parseBinaryCookies } from '../src/safari/binarycookies'
import { BrowserPeekError } from '../src/types'

type CookieInput = {
  domain: string
  name: string
  path: string
  value: string
  flags?: number
  expiry?: number
}

const FLAG_SECURE = 0x1
const FLAG_HTTP_ONLY = 0x4
const RECORD_HEADER = 48

function cstring(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, 'utf8'), Buffer.from([0])])
}

// Build one offset-addressed cookie record: a 48-byte header (flags at +8, the
// four string offsets at +16/20/24/28, expiry double at +40) then the
// null-terminated domain/name/path/value strings.
function buildRecord(cookie: CookieInput): Buffer {
  const strings = Buffer.concat([
    cstring(cookie.domain),
    cstring(cookie.name),
    cstring(cookie.path),
    cstring(cookie.value)
  ])
  const record = Buffer.alloc(RECORD_HEADER + strings.length)
  record.writeUInt32LE(record.length, 0)
  record.writeUInt32LE(cookie.flags ?? 0, 8)

  let offset = RECORD_HEADER
  record.writeUInt32LE(offset, 16)
  offset += cookie.domain.length + 1
  record.writeUInt32LE(offset, 20)
  offset += cookie.name.length + 1
  record.writeUInt32LE(offset, 24)
  offset += cookie.path.length + 1
  record.writeUInt32LE(offset, 28)

  record.writeDoubleLE(cookie.expiry ?? 0, 40)
  strings.copy(record, RECORD_HEADER)
  return record
}

function buildPage(cookies: CookieInput[]): Buffer {
  const records = cookies.map(buildRecord)
  const headerLength = 8 + 4 * records.length
  const header = Buffer.alloc(headerLength)
  header.writeUInt32LE(0x00000100, 0) // page tag, unused by the parser
  header.writeUInt32LE(records.length, 4)

  let cursor = headerLength
  records.forEach((record, index) => {
    header.writeUInt32LE(cursor, 8 + 4 * index)
    cursor += record.length
  })
  return Buffer.concat([header, ...records])
}

// Single-page `Cookies.binarycookies`: 'cook' magic, big-endian page count and
// page sizes, then the little-endian page.
function buildBinaryCookies(cookies: CookieInput[]): Buffer {
  const page = buildPage(cookies)
  const header = Buffer.alloc(12)
  header.write('cook', 0, 'latin1')
  header.writeUInt32BE(1, 4)
  header.writeUInt32BE(page.length, 8)
  return Buffer.concat([header, page])
}

describe('parseBinaryCookies', () => {
  test('extracts fields, flags, and expiry across cookies', () => {
    // 2025-01-01T00:00:00Z in Cocoa-epoch seconds (2001-01-01 base).
    const buffer = buildBinaryCookies([
      {
        domain: '.example.com',
        expiry: 757382400,
        flags: FLAG_SECURE | FLAG_HTTP_ONLY,
        name: 'sid',
        path: '/',
        value: 'xyz'
      },
      { domain: 'sub.test.org', expiry: 0, flags: 0, name: 'a', path: '/p', value: '' }
    ])

    const cookies = parseBinaryCookies(buffer)
    expect(cookies).toHaveLength(2)

    expect(cookies[0]).toEqual({
      domain: '.example.com',
      expires: '2025-01-01T00:00:00.000Z',
      httpOnly: true,
      name: 'sid',
      path: '/',
      secure: true,
      value: 'xyz'
    })

    expect(cookies[1]).toEqual({
      domain: 'sub.test.org',
      expires: undefined, // a zero expiry is a session cookie
      httpOnly: false,
      name: 'a',
      path: '/p',
      secure: false,
      value: ''
    })
  })

  test('throws BrowserPeekError on a non-binarycookies buffer', () => {
    expect(() => parseBinaryCookies(Buffer.from('not a cookie file'))).toThrow(BrowserPeekError)
  })
})
