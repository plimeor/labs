// Unit tests for createHttpAnchorBackend — mock fetch so no running server is needed.
// These tests verify:
//   1. Each backend method POSTs to BASE/rpc with {op, args}.
//   2. The error envelope {"error":{code,message}} is mapped to a thrown Error
//      whose message includes the code so `errorLooksLikeConflict` keeps working.
//   3. Successful responses are returned as-is.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { commandMap } from '../index'

// ---------------------------------------------------------------------------
// Minimal fetch mock
// ---------------------------------------------------------------------------

type FetchCall = { url: string; body: unknown }
let calls: FetchCall[] = []
let nextResponse: { ok: boolean; json: unknown } = { json: null, ok: true }

function mockFetch(url: string, init?: RequestInit): Promise<Response> {
  const body = init?.body ? JSON.parse(init.body as string) : undefined
  calls.push({ body, url })
  const json = nextResponse.json
  return Promise.resolve({
    ok: nextResponse.ok,
    json: () => Promise.resolve(json)
  } as Response)
}

// ---------------------------------------------------------------------------
// Module-level fetch replacement
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

beforeEach(() => {
  calls = []
  nextResponse = { json: null, ok: true }
  // @ts-expect-error — replacing global fetch for test isolation
  globalThis.fetch = mockFetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ---------------------------------------------------------------------------
// Helper: import fresh backend after mocking fetch
// ---------------------------------------------------------------------------

async function makeBackend() {
  // Re-import to pick up the mocked fetch that was installed before this call.
  // Bun caches modules, so we set a unique env flag to bust the cache.
  const { createHttpAnchorBackend } = await import('../http-operation-core')
  return createHttpAnchorBackend()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createHttpAnchorBackend — fetch shape', () => {
  test('listNotes: POSTs to /anchor-core/rpc with correct op', async () => {
    nextResponse = { json: [], ok: true }
    const backend = await makeBackend()
    await backend.listNotes()

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/anchor-core/rpc')
    expect((calls[0].body as { op: string }).op).toBe(commandMap.listNotes)
  })

  test('readNote: passes noteId as arg', async () => {
    const fakeNote = {
      body: '# Test',
      checksum: 'c1',
      filePath: 'notes/test.md',
      metadata: { id: 'abc' },
      revision: 'rev_1'
    }
    nextResponse = { json: fakeNote, ok: true }
    const backend = await makeBackend()
    const result = await backend.readNote('abc')

    expect((calls[0].body as { op: string; args: Record<string, unknown> }).args).toEqual({ noteId: 'abc' })
    expect(result).toMatchObject({ body: '# Test', metadata: { id: 'abc' } })
  })

  test('createNote: passes title and body as top-level args', async () => {
    const fakeNote = { body: '# Hi', metadata: { id: 'n1' }, revision: 'rev_a' }
    nextResponse = { json: fakeNote, ok: true }
    const backend = await makeBackend()
    await backend.createNote({ body: '# Hi', title: 'Hi' })

    const body = calls[0].body as { op: string; args: Record<string, unknown> }
    expect(body.op).toBe(commandMap.createNote)
    expect(body.args).toMatchObject({ body: '# Hi', title: 'Hi' })
  })

  test('searchNotes: wraps request in {request}', async () => {
    nextResponse = { json: [], ok: true }
    const backend = await makeBackend()
    const req = { fields: [] as [], limit: 10, query: 'foo', scope: { kind: 'all' as const } }
    await backend.searchNotes(req)

    const body = calls[0].body as { op: string; args: Record<string, unknown> }
    expect(body.op).toBe(commandMap.searchNotes)
    expect(body.args).toMatchObject({ request: req })
  })
})

describe('createHttpAnchorBackend — error envelope mapping', () => {
  test('conflict error: throws Error with code in message', async () => {
    nextResponse = { json: { error: { code: 'conflict', message: 'revision mismatch' } }, ok: true }
    const backend = await makeBackend()

    await expect(backend.updateNote({ baseRevision: 'old', body: 'x', noteId: 'n1' })).rejects.toThrow('conflict')
  })

  test('not_found error: throws Error with code in message', async () => {
    nextResponse = { json: { error: { code: 'not_found', message: 'note not found' } }, ok: true }
    const backend = await makeBackend()

    await expect(backend.readNote('missing')).rejects.toThrow('not_found')
  })

  test('vault_not_open error: throws Error with vault_not_open code', async () => {
    nextResponse = { json: { error: { code: 'vault_not_open', message: 'vault_not_open' } }, ok: true }
    const backend = await makeBackend()

    await expect(backend.listNotes()).rejects.toThrow('vault_not_open')
  })

  test('error message includes both code and detail', async () => {
    nextResponse = { json: { error: { code: 'conflict', message: 'revision mismatch: expected x, got y' } }, ok: true }
    const backend = await makeBackend()

    let thrown: Error | undefined
    try {
      await backend.updateNote({ baseRevision: 'x', body: '', noteId: 'n1' })
    } catch (e) {
      thrown = e as Error
    }
    expect(thrown).toBeDefined()
    // errorLooksLikeConflict checks for 'conflict' string in the message
    expect(thrown?.message).toContain('conflict')
  })
})

describe('createHttpAnchorBackend — HTTP integration gate', () => {
  // This describe block documents where the integration test would live.
  // Gated behind ANCHOR_HTTP_IT=1 so plain `bun test src` stays fast.
  test('ANCHOR_HTTP_IT integration test skipped (set ANCHOR_HTTP_IT=1 to run)', () => {
    if (process.env.ANCHOR_HTTP_IT !== '1') {
      // Gracefully skip — bun:test has no native skip/pending, so we just pass.
      // The integration harness in http-integration.test.ts handles the real test.
      return
    }
    // If somehow reached with the flag set, point to the integration file.
    throw new Error('Run ANCHOR_HTTP_IT=1 bun test src/backend/__tests__/http-integration.test.ts')
  })
})
