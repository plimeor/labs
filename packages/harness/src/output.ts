import type { StandardSchemaV1 } from '@standard-schema/spec'

import { HarnessRunOutputError } from './errors'
import type { HarnessRunEvent, HarnessRunResult, RunOutputRequest, StructuredOutputRequest } from './types'

export async function decodeRunOutput<Output extends RunOutputRequest>(input: {
  output: Output
  finalText: string
  exitCode: number | null
  signal?: string
}): Promise<{ events: HarnessRunEvent[]; result: HarnessRunResult<Output> }> {
  const mode = input.output.mode ?? 'text'

  if (mode === 'text') {
    return {
      events: input.finalText ? [{ text: input.finalText, type: 'text' }] : [],
      result: baseResult(input) as HarnessRunResult<Output>
    }
  }

  if (mode === 'jsonl') {
    const values = parseJsonLines(input.finalText, input.exitCode, input.signal)
    return {
      events: values.map(value => ({ type: 'json', value })),
      result: {
        ...baseResult(input),
        finalText: extractFinalText(values) ?? input.finalText
      } as HarnessRunResult<Output>
    }
  }

  return (await decodeStructuredOutput(
    input as { output: StructuredOutputRequest; finalText: string; exitCode: number | null; signal?: string }
  )) as { events: HarnessRunEvent[]; result: HarnessRunResult<Output> }
}

function extractFinalText(values: unknown[]): string | undefined {
  for (const value of values.toReversed()) {
    const text = extractTextFromEvent(value)
    if (text) {
      return text
    }
  }

  return undefined
}

function extractTextFromEvent(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const result = value.result
  if (typeof result === 'string' && result.length > 0) {
    return result
  }

  const structuredOutput = value.structured_output
  if (structuredOutput !== undefined) {
    return JSON.stringify(structuredOutput)
  }

  const item = value.item
  if (isRecord(item) && item.type === 'agent_message' && typeof item.text === 'string' && item.text.length > 0) {
    return item.text
  }

  const message = value.message
  if (isRecord(message)) {
    const messageText = extractTextFromContent(message.content)
    if (messageText) {
      return messageText
    }
  }

  return undefined
}

function extractTextFromContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined
  }

  const text = content
    .map(part => {
      if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
        return part.text
      }

      return ''
    })
    .join('')

  return text.length > 0 ? text : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function baseResult(input: { finalText: string; exitCode: number | null; signal?: string }): {
  exitCode: number | null
  signal?: string
  finalText: string
} {
  return {
    exitCode: input.exitCode,
    finalText: input.finalText,
    signal: input.signal
  }
}

function parseJsonLines(text: string, exitCode: number | null, signal: string | undefined): unknown[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)

  try {
    return lines.map(line => JSON.parse(line))
  } catch (cause) {
    throw new HarnessRunOutputError({
      cause,
      exitCode,
      finalText: text,
      kind: 'json_parse_failed',
      outputMode: 'jsonl',
      signal
    })
  }
}

async function decodeStructuredOutput<Schema extends StandardSchemaV1>(input: {
  output: StructuredOutputRequest<Schema>
  finalText: string
  exitCode: number | null
  signal?: string
}): Promise<{
  events: HarnessRunEvent[]
  result: HarnessRunResult<StructuredOutputRequest<Schema>>
}> {
  let value: unknown

  try {
    value = JSON.parse(input.finalText)
  } catch (cause) {
    throw new HarnessRunOutputError({
      cause,
      exitCode: input.exitCode,
      finalText: input.finalText,
      kind: 'json_parse_failed',
      outputMode: 'structured',
      signal: input.signal
    })
  }

  const structuredValue = extractStructuredValue(value)
  const validation = await input.output.schema['~standard'].validate(structuredValue)
  if (validation.issues) {
    throw new HarnessRunOutputError({
      cause: validation.issues,
      exitCode: input.exitCode,
      finalText: input.finalText,
      kind: 'structured_validation_failed',
      outputMode: 'structured',
      signal: input.signal
    })
  }

  return {
    events: [{ type: 'json', value }],
    result: {
      ...baseResult(input),
      finalText: extractTextFromEvent(value) ?? input.finalText,
      structured: validation.value as StandardSchemaV1.InferOutput<Schema>
    }
  }
}

function extractStructuredValue(value: unknown): unknown {
  if (isRecord(value) && value.structured_output !== undefined) {
    return value.structured_output
  }

  return value
}
