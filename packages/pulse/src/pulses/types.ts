export type PulseKind = 'manual' | 'scheduled'

export type PulseSource =
  | {
      path: string
      type: 'builtin'
    }
  | {
      path: string
      sha256: string
      type: 'file'
    }

export type PulseMetadata = {
  kind: PulseKind
  name: string
  schedule?: string
  source: PulseSource
}

export type LoadedPulse = PulseMetadata
