import { BrowserPeekError } from '../types'

export type SafariCookie = {
  domain: string
  name: string
  path: string
  value: string
  secure: boolean
  httpOnly: boolean
  expires?: string
}

// Cocoa epoch (2001-01-01) to Unix epoch offset, in seconds.
const COCOA_EPOCH_OFFSET = 978307200
const FLAG_SECURE = 0x1
const FLAG_HTTP_ONLY = 0x4

/**
 * Parses Safari's `Cookies.binarycookies` format: a `cook` header, big-endian
 * page sizes, then little-endian pages each holding offset-addressed cookie
 * records with null-terminated strings.
 */
export function parseBinaryCookies(buf: Buffer): SafariCookie[] {
  if (buf.subarray(0, 4).toString('latin1') !== 'cook') {
    throw new BrowserPeekError('Not a Safari binarycookies file.')
  }

  const pageCount = buf.readUInt32BE(4)
  const pageSizes: number[] = []
  let offset = 8
  for (let index = 0; index < pageCount; index++) {
    pageSizes.push(buf.readUInt32BE(offset))
    offset += 4
  }

  const cookies: SafariCookie[] = []
  let pageStart = offset
  for (const size of pageSizes) {
    parsePage(buf.subarray(pageStart, pageStart + size), cookies)
    pageStart += size
  }
  return cookies
}

function parsePage(page: Buffer, out: SafariCookie[]): void {
  const cookieCount = page.readUInt32LE(4)
  const offsets: number[] = []
  let cursor = 8
  for (let index = 0; index < cookieCount; index++) {
    offsets.push(page.readUInt32LE(cursor))
    cursor += 4
  }

  for (const cookieStart of offsets) {
    out.push(parseCookie(page, cookieStart))
  }
}

function parseCookie(page: Buffer, start: number): SafariCookie {
  const flags = page.readUInt32LE(start + 8)
  const domain = readCString(page, start + page.readUInt32LE(start + 16))
  const name = readCString(page, start + page.readUInt32LE(start + 20))
  const path = readCString(page, start + page.readUInt32LE(start + 24))
  const value = readCString(page, start + page.readUInt32LE(start + 28))
  const expirySeconds = page.readDoubleLE(start + 40)

  return {
    domain,
    name,
    path,
    value,
    expires: expiryToIso(expirySeconds),
    httpOnly: (flags & FLAG_HTTP_ONLY) !== 0,
    secure: (flags & FLAG_SECURE) !== 0
  }
}

function expiryToIso(expirySeconds: number): string | undefined {
  if (!expirySeconds || !Number.isFinite(expirySeconds)) {
    return undefined
  }
  return new Date((expirySeconds + COCOA_EPOCH_OFFSET) * 1000).toISOString()
}

function readCString(buf: Buffer, start: number): string {
  let end = start
  while (end < buf.length && buf[end] !== 0) {
    end++
  }
  return buf.subarray(start, end).toString('utf8')
}
