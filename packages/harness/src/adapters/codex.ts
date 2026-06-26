import { harness } from '../registry'
import { resolveOutputJsonSchema } from '../schema'
import type {
  HarnessContext,
  JsonlOutputRequest,
  RunOutputRequest,
  RunRequest,
  StructuredOutputRequest,
  TextOutputRequest
} from '../types'
import { createCodexMcpDriver } from './codex-extensions'
import { configDirectory, createExtensionFacet, createJsonHooksDriver } from './extensions'
import { createBuiltInAdapter, planCommand, planTextCommand, shellQuote, unsupportedOutputMode } from './shared'

const HARNESS_ID = 'codex'

export const codexAdapter = createBuiltInAdapter({
  commands: ['codex'],
  id: HARNESS_ID,
  identity: /codex/i,
  installHint: 'Install OpenAI Codex CLI and ensure `codex --version` is available on PATH.',
  requiresGoogleAccessBeforeSmoke: true,
  extensions(context: HarnessContext | undefined) {
    const directory = configDirectory(context?.home, '.codex')
    return createExtensionFacet({
      configDirectory: directory,
      context,
      harnessId: HARNESS_ID,
      hooks: createJsonHooksDriver(`${directory}/hooks.json`, [
        'PermissionRequest',
        'PostCompact',
        'PostToolUse',
        'PreCompact',
        'PreToolUse',
        'SessionStart',
        'Stop',
        'SubagentStart',
        'SubagentStop',
        'UserPromptSubmit'
      ]),
      mcp: createCodexMcpDriver(`${directory}/config.toml`),
      skillsDirectory: `${directory}/skills`
    })
  },
  plan(request: RunRequest<RunOutputRequest>, command: string, cwd: string) {
    const output = request.output ?? ({ mode: 'text' } satisfies TextOutputRequest)
    if (output.mode === 'jsonl') {
      return planTextCommand({
        args: ['exec', '--skip-git-repo-check', '--json', request.prompt],
        command,
        cwd,
        harnessId: HARNESS_ID,
        output: output satisfies JsonlOutputRequest,
        request
      })
    }

    if (output.mode === 'structured') {
      const jsonSchema = resolveOutputJsonSchema(output.schema)
      if (!jsonSchema) {
        return unsupportedOutputMode(HARNESS_ID, output)
      }

      return planCommand({
        args: ['-lc', codexStructuredCommand(command, request.prompt, JSON.stringify(jsonSchema))],
        command: 'sh',
        cwd,
        harnessId: HARNESS_ID,
        output: output satisfies StructuredOutputRequest,
        request
      })
    }

    if (!output.mode || output.mode === 'text') {
      return planTextCommand({
        args: ['exec', '--skip-git-repo-check', '--color', 'never', request.prompt],
        command,
        cwd,
        harnessId: HARNESS_ID,
        output: { mode: 'text' },
        request
      })
    }

    return unsupportedOutputMode(HARNESS_ID, output)
  }
})

harness.use(codexAdapter)

function codexStructuredCommand(command: string, prompt: string, jsonSchema: string): string {
  return [
    'schema=$(mktemp /tmp/codex-schema.XXXXXX)',
    'out=$(mktemp /tmp/codex-output.XXXXXX)',
    'cleanup() { rm -f "$schema" "$out"; }',
    'trap cleanup EXIT',
    `printf %s ${shellQuote(jsonSchema)} > "$schema"`,
    [
      shellQuote(command),
      'exec',
      '--skip-git-repo-check',
      '--color',
      'never',
      '--output-schema',
      '"$schema"',
      '--output-last-message',
      '"$out"',
      shellQuote(prompt),
      '>/dev/null'
    ].join(' '),
    'code=$?',
    '[ -f "$out" ] && cat "$out"',
    'exit "$code"'
  ].join('; ')
}
