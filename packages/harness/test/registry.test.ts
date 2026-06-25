import { describe, expect, test } from 'bun:test'

import { harness } from '../src/index'

const REAL_CLI_TIMEOUT_MS = 90_000

describe('registry', () => {
  test(
    'registers, lists, detects, and opens adapters deterministically',
    async () => {
      expect(harness.list().map(adapter => adapter.id)).toEqual(['claude', 'codex', 'kiro', 'pi'])
      await expect(harness.detectAll()).resolves.toEqual([
        expect.objectContaining({ detected: true, id: 'claude' }),
        expect.objectContaining({ detected: true, id: 'codex' }),
        expect.objectContaining({ detected: true, id: 'kiro' }),
        expect.objectContaining({ detected: true, id: 'pi' })
      ])
      await expect(harness.open('codex')).resolves.toMatchObject({
        detection: expect.objectContaining({ detected: true, id: 'codex' })
      })
    },
    REAL_CLI_TIMEOUT_MS
  )

  test('rejects duplicate adapters and unknown ids', async () => {
    const codexAdapter = realAdapter('codex')

    expect(() => harness.use(codexAdapter)).toThrow('Duplicate harness adapter')
    await expect(harness.open('missing')).rejects.toThrow('Unknown harness adapter')
  })
})

function realAdapter(id: string) {
  const adapter = harness.list().find(candidate => candidate.id === id)
  if (!adapter) {
    throw new Error(`Missing adapter ${id}`)
  }

  return adapter
}
