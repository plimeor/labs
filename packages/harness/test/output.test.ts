import { describe, expect, test } from 'bun:test'

import { decodeRunOutput } from '../src/output'
import { jsonObjectSchema, objectSchema } from './schema'

describe('output decoding', () => {
  test('returns final text for text output', async () => {
    const decoded = await decodeRunOutput({
      exitCode: 0,
      finalText: 'done',
      output: { mode: 'text' }
    })

    expect(decoded.result.finalText).toBe('done')
    expect(decoded.events).toEqual([{ text: 'done', type: 'text' }])
  })

  test('parses JSONL output', async () => {
    const decoded = await decodeRunOutput({
      exitCode: 0,
      finalText: '{"a":1}\n{"type":"result","result":"done"}\n',
      output: { mode: 'jsonl' }
    })

    expect(decoded.events).toEqual([
      { type: 'json', value: { a: 1 } },
      { type: 'json', value: { result: 'done', type: 'result' } }
    ])
    expect(decoded.result.finalText).toBe('done')
  })

  test('rejects invalid JSONL output with a typed error', async () => {
    await expect(
      decodeRunOutput({
        exitCode: 1,
        finalText: '{"a":1}\nnope',
        output: { mode: 'jsonl' }
      })
    ).rejects.toMatchObject({
      exitCode: 1,
      finalText: '{"a":1}\nnope',
      kind: 'json_parse_failed',
      name: 'HarnessRunOutputError',
      outputMode: 'jsonl'
    })
  })

  test('validates structured output', async () => {
    const schema = objectSchema<{ answer: string }>(
      (value): value is { answer: string } => typeof value.answer === 'string'
    )
    const decoded = await decodeRunOutput({
      exitCode: 0,
      finalText: '{"answer":"ok"}',
      output: { mode: 'structured', schema }
    })

    expect(decoded.result.structured).toEqual({ answer: 'ok' })
  })

  test('validates Claude structured output wrapper', async () => {
    const schema = jsonObjectSchema<{ answer: string }>(
      {
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        type: 'object'
      },
      (value): value is { answer: string } => typeof value.answer === 'string'
    )
    const decoded = await decodeRunOutput({
      exitCode: 0,
      finalText: '{"type":"result","result":"{\\"answer\\":\\"ok\\"}","structured_output":{"answer":"ok"}}',
      output: { mode: 'structured', schema }
    })

    expect(decoded.result.finalText).toBe('{"answer":"ok"}')
    expect(decoded.result.structured).toEqual({ answer: 'ok' })
  })

  test('rejects structured schema failures with a typed error', async () => {
    const schema = objectSchema<{ answer: string }>(
      (value): value is { answer: string } => typeof value.answer === 'string'
    )

    await expect(
      decodeRunOutput({
        exitCode: 0,
        finalText: '{"answer":1}',
        output: { mode: 'structured', schema }
      })
    ).rejects.toMatchObject({
      kind: 'structured_validation_failed',
      name: 'HarnessRunOutputError',
      outputMode: 'structured'
    })
  })
})
