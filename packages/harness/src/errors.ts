import type { HarnessId, RunOutputRequest } from './types'

export type OutputErrorKind = 'json_parse_failed' | 'structured_validation_failed'
export type OutputErrorMode = Exclude<RunOutputRequest['mode'], 'text' | undefined>

export class HarnessRunOutputError extends Error {
  readonly kind: OutputErrorKind
  readonly outputMode: OutputErrorMode
  readonly finalText: string
  readonly exitCode: number | null
  readonly signal?: string
  override readonly cause: unknown

  constructor(input: {
    kind: OutputErrorKind
    outputMode: OutputErrorMode
    finalText: string
    exitCode: number | null
    signal?: string
    cause: unknown
  }) {
    super(`${input.outputMode} output failed: ${input.kind}`)
    this.name = 'HarnessRunOutputError'
    this.kind = input.kind
    this.outputMode = input.outputMode
    this.finalText = input.finalText
    this.exitCode = input.exitCode
    this.signal = input.signal
    this.cause = input.cause
  }
}

export class HarnessPlanError extends Error {
  readonly harnessId: HarnessId
  readonly kind: 'unsupported_output_mode' | 'unsupported_operation'

  constructor(input: { harnessId: HarnessId; kind: HarnessPlanError['kind']; message: string }) {
    super(input.message)
    this.name = 'HarnessPlanError'
    this.harnessId = input.harnessId
    this.kind = input.kind
  }
}
