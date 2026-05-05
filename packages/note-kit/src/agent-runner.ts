import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'

import { toJsonSchema } from '@valibot/to-json-schema'
import * as v from 'valibot'

type ValibotSchema = v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>

export async function agentRunner<TSchema extends ValibotSchema>(
  prompt: string,
  schema: TSchema
): Promise<v.InferOutput<TSchema>>
export async function agentRunner(prompt: string): Promise<string>
export async function agentRunner(prompt: string, schema?: ValibotSchema): Promise<unknown> {
  const tempDir = schema ? await mkdtemp(join(tmpdir(), 'agent-runner-')) : undefined
  const outputSchemaFile = tempDir ? join(tempDir, 'output-schema.json') : undefined

  try {
    if (schema && outputSchemaFile) {
      await Bun.write(outputSchemaFile, JSON.stringify(toJsonSchema(schema, { errorMode: 'ignore' }), null, 2))
    }

    const result = await runCodex(injectNoteGatewayPrompt(prompt), outputSchemaFile)
    if (result.exitCode !== 0) {
      throw new Error(formatCodexError(result))
    }

    const output = extractLastAgentMessage(result.stdout.toString())
    if (!schema) {
      return output
    }

    let json: unknown
    try {
      json = JSON.parse(output)
    } catch (error) {
      throw new Error(`Codex returned non-JSON output for a schema-bound run: ${String(error)}`)
    }

    return v.parse(schema, json)
  } finally {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true })
    }
  }
}

const NOTE_GATEWAY_PROMPT = [
  'Local note access:',
  '- You may freely use the readonly `note-gateway` CLI to inspect notes when note context would help.',
  '- Useful commands: `note-gateway search "query" --json` and `note-gateway get <noteId> --json`.',
  '- The CLI is readonly; do not claim you changed notes through it.'
].join('\n')

function injectNoteGatewayPrompt(prompt: string): string {
  return `${NOTE_GATEWAY_PROMPT}\n\n${prompt}`
}

async function runCodex(prompt: string, outputSchemaFile?: string): Promise<$.ShellOutput> {
  const stdin = new Response(prompt)

  if (outputSchemaFile) {
    return await $`codex -a never -s danger-full-access exec --json --ephemeral -C ${process.cwd()} --skip-git-repo-check --output-schema ${outputSchemaFile} - < ${stdin}`
      .quiet()
      .nothrow()
  }

  return await $`codex -a never -s danger-full-access exec --json --ephemeral -C ${process.cwd()} --skip-git-repo-check - < ${stdin}`
    .quiet()
    .nothrow()
}

function extractLastAgentMessage(stdout: string): string {
  let message: string | undefined

  for (const line of stdout.split('\n')) {
    const event = parseJsonEvent(line)
    if (event?.type === 'item.completed' && event.item?.type === 'agent_message') {
      message = event.item.text
    }
  }

  if (message === undefined) {
    throw new Error('Codex CLI completed without an agent_message event.')
  }
  return message
}

function parseJsonEvent(line: string):
  | {
      type?: string
      item?: {
        type?: string
        text?: string
      }
    }
  | undefined {
  const start = line.indexOf('{')
  if (start === -1) {
    return undefined
  }

  try {
    return JSON.parse(line.slice(start))
  } catch {
    return undefined
  }
}

function formatCodexError(result: $.ShellOutput): string {
  const stderr = result.stderr.toString().trim()
  const stdout = result.stdout.toString().trim()
  const details = [stderr, stdout].filter(Boolean).join('\n')
  return details
    ? `Codex CLI failed with exit code ${result.exitCode}:\n${details}`
    : `Codex CLI failed with exit code ${result.exitCode}.`
}
