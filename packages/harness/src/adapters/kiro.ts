import { harness } from '../registry'
import type { HarnessContext, RunOutputRequest, RunRequest, TextOutputRequest } from '../types'
import { configDirectory, createExtensionFacet } from './extensions'
import { createBuiltInAdapter, planTextCommand, unsupportedOutputMode } from './shared'

const HARNESS_ID = 'kiro'

export const kiroAdapter = createBuiltInAdapter({
  commands: ['kiro-cli'],
  id: HARNESS_ID,
  identity: /kiro/i,
  installHint: 'Install Kiro CLI and ensure `kiro-cli --version` is available on PATH.',
  extensions(context: HarnessContext | undefined) {
    const directory = context?.env?.KIRO_HOME ?? configDirectory(context?.home, '.kiro')
    return createExtensionFacet({
      configDirectory: directory,
      context,
      harnessId: HARNESS_ID,
      mcp: { configFile: `${directory}/settings/mcp.json`, kind: 'kiro-cli' },
      skillsDirectory: `${directory}/skills`,
      hooks: {
        hooksDirectory: `${directory}/hooks`,
        kind: 'kiro-hook-files',
        events: [
          'Manual',
          'PostFileCreate',
          'PostFileDelete',
          'PostFileSave',
          'PostTaskExec',
          'PostToolUse',
          'PreTaskExec',
          'PreToolUse',
          'SessionStart',
          'Stop',
          'UserPromptSubmit'
        ]
      }
    })
  },
  plan(request: RunRequest<RunOutputRequest>, command: string, cwd: string) {
    const output = request.output ?? ({ mode: 'text' } satisfies TextOutputRequest)
    if (!output.mode || output.mode === 'text') {
      return planTextCommand({
        args: ['chat', '--no-interactive', '--wrap', 'never', request.prompt],
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

harness.use(kiroAdapter)
