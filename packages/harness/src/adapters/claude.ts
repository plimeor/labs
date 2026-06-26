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
import { configDirectory, createExtensionFacet, createJsonHooksDriver, createJsonMcpDriver } from './extensions'
import { createBuiltInAdapter, planCommand, planTextCommand, unsupportedOutputMode } from './shared'

const HARNESS_ID = 'claude'

export const claudeAdapter = createBuiltInAdapter({
  commands: ['claude'],
  id: HARNESS_ID,
  identity: /claude/i,
  installHint: 'Install Claude Code and ensure `claude --version` is available on PATH.',
  requiresGoogleAccessBeforeSmoke: true,
  extensions(context: HarnessContext | undefined) {
    const directory = configDirectory(context?.home, '.claude')
    return createExtensionFacet({
      configDirectory: directory,
      context,
      harnessId: HARNESS_ID,
      hooks: createJsonHooksDriver(`${directory}/settings.json`, [
        'SessionStart',
        'Setup',
        'UserPromptSubmit',
        'UserPromptExpansion',
        'PreToolUse',
        'PermissionRequest',
        'PermissionDenied',
        'PostToolUse',
        'PostToolUseFailure',
        'PostToolBatch',
        'Notification',
        'MessageDisplay',
        'SubagentStart',
        'SubagentStop',
        'TaskCreated',
        'TaskCompleted',
        'Stop',
        'StopFailure',
        'TeammateIdle',
        'InstructionsLoaded',
        'ConfigChange',
        'CwdChanged',
        'FileChanged',
        'WorktreeCreate',
        'WorktreeRemove',
        'PreCompact',
        'PostCompact',
        'Elicitation',
        'ElicitationResult',
        'SessionEnd'
      ]),
      mcp: createJsonMcpDriver(`${directory}/mcp.json`),
      skillsDirectory: `${directory}/skills`
    })
  },
  plan(request: RunRequest<RunOutputRequest>, command: string, cwd: string) {
    const output = request.output ?? ({ mode: 'text' } satisfies TextOutputRequest)
    if (output.mode === 'jsonl') {
      return planTextCommand({
        args: ['-p', '--output-format', 'json', request.prompt],
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
        args: ['-p', '--output-format', 'json', '--json-schema', JSON.stringify(jsonSchema), request.prompt],
        command,
        cwd,
        harnessId: HARNESS_ID,
        output: output satisfies StructuredOutputRequest,
        request
      })
    }

    if (!output.mode || output.mode === 'text') {
      return planTextCommand({
        args: ['-p', '--output-format', 'text', request.prompt],
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

harness.use(claudeAdapter)
