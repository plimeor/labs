import { describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Bear } from '../src/index.js'

describe('bear-sdk', () => {
  test('falls back to bearcli when bear is unavailable on PATH', async () => {
    const bin = await mkdtemp(join(tmpdir(), 'bear-sdk-bin-'))
    try {
      const bearcli = join(bin, 'bearcli')
      await writeFile(
        bearcli,
        `#!/bin/sh
if [ "$1" = "list" ]; then
  printf '%s' '[{"id":"1","title":"Fallback","locked":"no","tags":[],"hash":"abc123","length":10,"created":"2026-05-04T00:00:00Z","modified":"2026-05-04T00:00:00Z","pins":[],"location":"notes","todos":0,"done":0,"attachments":[]}]'
  exit 0
fi
exit 1
`
      )
      await chmod(bearcli, 0o755)

      await expect(Bear.list({ env: { ...process.env, PATH: bin } })).resolves.toEqual([
        {
          attachments: [],
          created: '2026-05-04T00:00:00Z',
          done: 0,
          hash: 'abc123',
          id: '1',
          length: 10,
          location: 'notes',
          locked: false,
          modified: '2026-05-04T00:00:00Z',
          pins: [],
          tags: [],
          title: 'Fallback',
          todos: 0
        }
      ])
    } finally {
      await rm(bin, { force: true, recursive: true })
    }
  })

  test('creates Bear notes, validates SDK reads and mutations, then trashes test notes', async () => {
    const runId = testRunId()
    const tag = `bear-sdk-test/${runId}`
    const createdIds: string[] = []

    try {
      const first = await Bear.create({
        content: `Alpha body\nTODO item ${runId}`,
        tags: [tag],
        title: `Bear SDK Test ${runId} A`
      })
      const second = await Bear.create({
        content: `Beta body ${runId}`,
        tags: [tag],
        title: `Bear SDK Test ${runId} B`
      })
      const firstId = first.id
      const secondId = second.id
      createdIds.push(firstId, secondId)

      expect(typeof firstId).toBe('string')
      expect(first.title).toBe(`Bear SDK Test ${runId} A`)
      expect(typeof secondId).toBe('string')
      expect(second.title).toBe(`Bear SDK Test ${runId} B`)

      const listed = await Bear.list({ tag })
      expect(listed.map(note => note.id)).toEqual(expect.arrayContaining(createdIds))
      expect(listed.find(note => note.id === firstId)).toMatchObject({
        created: expect.any(String),
        hash: expect.any(String),
        location: 'notes',
        locked: false,
        pins: expect.any(Array)
      })

      const count = await Bear.count({ tag })
      expect(count).toBeGreaterThanOrEqual(2)

      const searchResults = await Bear.search(`"${runId}"`)
      expect(searchResults.map(note => note.id)).toEqual(expect.arrayContaining(createdIds))
      expect(searchResults.find(note => note.id === firstId)).toMatchObject({
        created: expect.any(String),
        hash: expect.any(String),
        location: 'notes',
        matches: expect.any(Number)
      })

      const shown = await Bear.show({ id: firstId }, { includeContent: true })
      expect(shown).toMatchObject({
        id: firstId,
        location: 'notes',
        title: `Bear SDK Test ${runId} A`
      })
      expect(shown.content).toContain(`TODO item ${runId}`)

      await expect(Bear.cat({ id: firstId })).resolves.toContain(`Alpha body`)

      const matches = await Bear.searchIn({ id: firstId }, { string: `TODO item ${runId}` })
      expect(matches).toHaveLength(1)

      await Bear.append({ id: firstId }, { content: `\nAppended ${runId}` })
      await expect(Bear.cat({ id: firstId })).resolves.toContain(`Appended ${runId}`)

      await Bear.edit({ id: firstId }, { find: `TODO item ${runId}`, replace: `DONE item ${runId}` })
      await expect(Bear.cat({ id: firstId })).resolves.toContain(`DONE item ${runId}`)

      const beforeWrite = await Bear.show({ id: firstId })
      await Bear.overwrite(
        { id: firstId },
        {
          base: beforeWrite.hash,
          content: `# Bear SDK Test ${runId} A\n\nRewritten ${runId}\n#${tag}`
        }
      )
      await expect(Bear.cat({ id: firstId })).resolves.toContain(`Rewritten ${runId}`)
    } finally {
      await trashNotes(createdIds)
    }
  })

  test('creates a Bear note, validates attachment operations, then trashes the test note', async () => {
    const runId = testRunId()
    const createdIds: string[] = []

    try {
      const note = await Bear.create({
        content: `Attachment test body ${runId}`,
        tags: [`bear-sdk-test/${runId}`],
        title: `Bear SDK Attachment Test ${runId}`
      })
      createdIds.push(note.id)

      await Bear.addAttachment(
        { id: note.id },
        {
          data: `attachment payload ${runId}`,
          filename: `bear-sdk-${runId}.txt`
        }
      )

      const attachments = await Bear.listAttachments({ id: note.id })
      expect(attachments).toContainEqual({
        filename: `bear-sdk-${runId}.txt`,
        size: Buffer.byteLength(`attachment payload ${runId}`)
      })

      const saved = await Bear.saveAttachment({ id: note.id }, { filename: `bear-sdk-${runId}.txt` })
      expect(saved).toEqual({
        base64: Buffer.from(`attachment payload ${runId}`).toString('base64'),
        filename: `bear-sdk-${runId}.txt`,
        size: Buffer.byteLength(`attachment payload ${runId}`)
      })

      await Bear.deleteAttachment({ id: note.id }, { filename: `bear-sdk-${runId}.txt` })
      await expect(Bear.listAttachments({ id: note.id })).resolves.not.toContainEqual(
        expect.objectContaining({ filename: `bear-sdk-${runId}.txt` })
      )
    } finally {
      await trashNotes(createdIds)
    }
  })
})

function testRunId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`
}

async function trashNotes(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async id => {
      await Bear.trash({ id }).catch(() => undefined)
    })
  )
}
