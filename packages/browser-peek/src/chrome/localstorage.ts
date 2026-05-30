import { Level } from 'level'

import { withTempCopy } from '../shared/temp'

export type RawEntry = {
  origin: string
  key: string
  value: string
}

const ENTRY_PREFIX = 0x5f // '_'
const SEPARATOR = 0x00

/**
 * Chrome stores Local Storage in a LevelDB. Value entries are keyed
 * `_<storageKey>\x00<typeByte><keyBytes>`; values are `<typeByte><valueBytes>`.
 * The type byte is `0` for UTF-16LE and `1` for Latin-1. `META:`/`VERSION` keys
 * are skipped.
 */
export async function readLevelDb(leveldbDir: string): Promise<RawEntry[]> {
  return withTempCopy(leveldbDir, 'dir', async copyPath => {
    const db = new Level<Buffer, Buffer>(copyPath, {
      createIfMissing: false,
      keyEncoding: 'buffer',
      valueEncoding: 'buffer'
    })
    await db.open()

    try {
      const entries: RawEntry[] = []
      for await (const [rawKey, rawValue] of db.iterator()) {
        if (rawKey.length === 0 || rawKey[0] !== ENTRY_PREFIX) {
          continue
        }

        const separator = rawKey.indexOf(SEPARATOR)
        if (separator < 0) {
          continue
        }

        entries.push({
          key: decodeChunk(rawKey.subarray(separator + 1)),
          origin: rawKey.subarray(1, separator).toString('utf8'),
          value: decodeChunk(rawValue)
        })
      }
      return entries
    } finally {
      await db.close()
    }
  })
}

function decodeChunk(buf: Buffer): string {
  if (buf.length === 0) {
    return ''
  }

  const body = buf.subarray(1)
  return buf[0] === 0 ? body.toString('utf16le') : body.toString('latin1')
}
