import { harness } from '../registry'
import type { HarnessContext, JsonlOutputRequest, RunOutputRequest, RunRequest, TextOutputRequest } from '../types'
import { configDirectory, createExtensionFacet } from './extensions'
import { createBuiltInAdapter, planCommand, shellQuote, unsupportedOutputMode } from './shared'

const HARNESS_ID = 'pi'

export const piAdapter = createBuiltInAdapter({
  commands: ['pi'],
  id: HARNESS_ID,
  identity: /^\d+\.\d+\.\d+/,
  installHint: 'Install pi and ensure `pi --version` is available on PATH.',
  extensions(context: HarnessContext | undefined) {
    const directory = configDirectory(context?.home, '.pi/agent')
    return createExtensionFacet({
      configDirectory: directory,
      context,
      harnessId: HARNESS_ID,
      skillsDirectory: `${directory}/skills`
    })
  },
  plan(request: RunRequest<RunOutputRequest>, command: string, cwd: string) {
    const output = request.output ?? ({ mode: 'text' } satisfies TextOutputRequest)
    if (output.mode === 'jsonl') {
      return planCommand({
        args: ['-lc', piCommand(command, request.prompt, 'json')],
        command: 'fish',
        cwd,
        harnessId: HARNESS_ID,
        output: output satisfies JsonlOutputRequest,
        request
      })
    }

    if (!output.mode || output.mode === 'text') {
      return planCommand({
        args: ['-lc', piCommand(command, request.prompt, 'text')],
        command: 'fish',
        cwd,
        harnessId: HARNESS_ID,
        output: { mode: 'text' },
        request
      })
    }

    return unsupportedOutputMode(HARNESS_ID, output)
  }
})

harness.use(piAdapter)

function piCommand(command: string, prompt: string, mode: 'json' | 'text'): string {
  return [
    shellQuote(command),
    '-p',
    '--no-session',
    '--no-tools',
    '--no-extensions',
    '--no-skills',
    '--no-context-files',
    '--mode',
    mode,
    shellQuote(prompt)
  ].join(' ')
}
