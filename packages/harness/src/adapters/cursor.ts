import { harness } from '../registry'
import type { HarnessContext, JsonlOutputRequest, RunOutputRequest, RunRequest, TextOutputRequest } from '../types'
import { configDirectory, createCursorHooksDriver, createExtensionFacet, createJsonMcpDriver } from './extensions'
import { createBuiltInAdapter, planTextCommand, unsupportedOutputMode } from './shared'

const HARNESS_ID = 'cursor'

export const cursorAdapter = createBuiltInAdapter({
  commands: ['agent'],
  id: HARNESS_ID,
  identity: /^\d{4}\.\d{2}\.\d{2}/,
  installHint: 'Install Cursor CLI and ensure `agent --version` is available on PATH.',
  requiresGoogleAccessBeforeSmoke: true,
  extensions(context: HarnessContext | undefined) {
    const directory = configDirectory(context?.home, '.cursor')
    return createExtensionFacet({
      configDirectory: directory,
      context,
      harnessId: HARNESS_ID,
      hooks: createCursorHooksDriver(`${directory}/hooks.json`),
      mcp: createJsonMcpDriver(`${directory}/mcp.json`),
      skillsDirectory: `${directory}/skills`
    })
  },
  plan(request: RunRequest<RunOutputRequest>, command: string, cwd: string) {
    const output = request.output ?? ({ mode: 'text' } satisfies TextOutputRequest)
    if (output.mode === 'jsonl') {
      return planTextCommand({
        args: ['-p', '--force', '--output-format', 'stream-json', request.prompt],
        command,
        cwd,
        harnessId: HARNESS_ID,
        output: output satisfies JsonlOutputRequest,
        request
      })
    }

    if (!output.mode || output.mode === 'text') {
      return planTextCommand({
        args: ['-p', '--force', '--output-format', 'text', request.prompt],
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

harness.use(cursorAdapter)
