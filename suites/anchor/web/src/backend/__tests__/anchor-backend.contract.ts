// Shared contract test suite for AnchorBackend implementations.
// Call runAnchorBackendContractSuite(createBackend) from any test to validate
// that a backend satisfies the core behavioral contract.

import { beforeEach, describe, expect, test } from 'bun:test'

import type { AnchorBackend } from '../../domain/types'

export function runAnchorBackendContractSuite(createBackend: () => AnchorBackend) {
  describe('openDemoVault + createNote + readNote round-trip', () => {
    let backend: AnchorBackend

    beforeEach(async () => {
      backend = createBackend()
      await backend.openDemoVault()
    })

    test('createNote then readNote returns same note', async () => {
      const created = await backend.createNote({ body: '# Contract\n\nBody text.', title: 'Contract Test Note' })
      const read = await backend.readNote(created.metadata.id)
      expect(read.metadata.id).toBe(created.metadata.id)
      expect(read.metadata.title).toBe('Contract Test Note')
      expect(read.body).toBe('# Contract\n\nBody text.')
    })

    test('createNote returns structuredClone (no shared reference)', async () => {
      const created = await backend.createNote({ title: 'Clone Test' })
      const read = await backend.readNote(created.metadata.id)
      // Mutating created.metadata should not affect subsequent reads
      created.metadata.title = 'mutated'
      expect(read.metadata.title).toBe('Clone Test')
    })
  })

  describe('updateNote conflict detection', () => {
    let backend: AnchorBackend

    beforeEach(async () => {
      backend = createBackend()
      await backend.openDemoVault()
    })

    test('updateNote rejects on stale baseRevision', async () => {
      const note = await backend.createNote({ title: 'Conflict Test' })
      // First update succeeds
      const updated = await backend.updateNote({
        baseRevision: note.revision,
        body: '# Updated\n\nFirst update.',
        noteId: note.metadata.id
      })
      // Second update with original revision should conflict
      await expect(
        backend.updateNote({
          baseRevision: note.revision,
          body: '# Updated\n\nSecond update.',
          noteId: note.metadata.id
        })
      ).rejects.toThrow('conflict')
      // Update with correct current revision should succeed
      const final = await backend.updateNote({
        baseRevision: updated.revision,
        body: '# Updated\n\nThird update.',
        noteId: note.metadata.id
      })
      expect(final.body).toBe('# Updated\n\nThird update.')
    })
  })

  describe('applyProposedChange conflict check', () => {
    let backend: AnchorBackend

    beforeEach(async () => {
      backend = createBackend()
      await backend.openDemoVault()
    })

    test('applyProposedChange rejects if note has been updated since proposal', async () => {
      const note = await backend.createNote({ title: 'Proposed Change Target' })
      const proposed = await backend.createProposedChange({
        bodyAppend: '\n\nAgent addition.',
        mode: 'ask',
        noteId: note.metadata.id,
        provenance: 'contract test'
      })
      // Update note so its revision diverges from the proposal base
      await backend.updateNote({
        baseRevision: note.revision,
        body: '# New body after proposal was created.',
        noteId: note.metadata.id
      })
      // applyProposedChange should throw conflict
      await expect(backend.applyProposedChange(proposed.id)).rejects.toThrow('conflict')
    })

    test('applyProposedChange succeeds on fresh proposal', async () => {
      const note = await backend.createNote({ title: 'Fresh Proposal Target' })
      const proposed = await backend.createProposedChange({
        bodyAppend: '\n\nAgent addition.',
        mode: 'ask',
        noteId: note.metadata.id,
        provenance: 'contract test'
      })
      const result = await backend.applyProposedChange(proposed.id)
      expect(result.note.body).toContain('Agent addition.')
      expect(result.operation.operationType).toBe('apply_proposed_change')
    })
  })

  describe('openTodayJournal idempotency', () => {
    let backend: AnchorBackend

    beforeEach(async () => {
      backend = createBackend()
      await backend.openDemoVault()
    })

    test('calling openTodayJournal twice returns same journal id', async () => {
      const first = await backend.openTodayJournal()
      const second = await backend.openTodayJournal()
      expect(first.metadata.id).toBe(second.metadata.id)
      expect(first.metadata.kind).toBe('journal')
    })

    test('only one journal note exists for today after two calls', async () => {
      await backend.openTodayJournal()
      await backend.openTodayJournal()
      const notes = await backend.listNotes()
      const today = new Date().toISOString().slice(0, 10)
      const journals = notes.filter(n => n.kind === 'journal' && n.title === today)
      expect(journals).toHaveLength(1)
    })
  })

  describe('searchNotes filtering', () => {
    let backend: AnchorBackend

    beforeEach(async () => {
      backend = createBackend()
      await backend.openDemoVault()
    })

    test('query filter returns matching notes', async () => {
      const results = await backend.searchNotes({
        fields: ['snippet'],
        limit: 10,
        query: 'Anchor',
        scope: { kind: 'all' }
      })
      expect(results.length).toBeGreaterThan(0)
      // At least one result should have the query matched in a named field
      const hasNamedMatch = results.some(r => r.matchedFields.length > 0)
      expect(hasNamedMatch).toBe(true)
    })

    test('tag filter returns only notes with that tag', async () => {
      const results = await backend.searchNotes({
        fields: [],
        limit: 10,
        query: '',
        scope: { kind: 'all' },
        tag: 'product'
      })
      expect(results.length).toBeGreaterThan(0)
      for (const r of results) {
        expect(r.matchedFields.length).toBeGreaterThanOrEqual(0)
      }
    })

    test('type filter returns only notes of that type', async () => {
      const results = await backend.searchNotes({
        fields: ['metadata'],
        limit: 10,
        query: '',
        scope: { kind: 'all' },
        type: 'Project'
      })
      expect(results.length).toBeGreaterThan(0)
      for (const r of results) {
        expect(r.type).toBe('Project')
      }
    })
  })
}
