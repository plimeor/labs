import type { StandardSchemaV1 } from '@standard-schema/spec'

export type HarnessId = 'claude' | 'codex' | 'cursor' | 'kiro' | 'pi' | (string & {})

export type HarnessContext = {
  /** Default working directory for adapter operations; relative extension paths resolve from here. */
  cwd?: string
  /** Base environment available to detection, planning, and adapter-owned native commands. */
  env?: Record<string, string | undefined>
  /** User home directory used for user-scope native config resolution. */
  home?: string
}

export type HarnessRegistry = {
  use(adapter: HarnessAdapter): void
  list(): HarnessAdapter[]
  detectAll(context?: HarnessContext): Promise<HarnessDetection[]>
  open(id: HarnessId, context?: HarnessContext): Promise<HarnessHandle>
}

export type HarnessAdapter = {
  id: HarnessId
  detect(context?: HarnessContext): Promise<HarnessDetection>
  open(context?: HarnessContext): Promise<HarnessHandle>
}

export type HarnessHandle = {
  detection: HarnessDetection
  health: HealthFacet
  process: ProcessFacet
  extensions: ExtensionFacet
}

export type HarnessDetection = {
  id: HarnessId
  detected: boolean
  binary?: {
    /** Executable name or path used to invoke the detected harness CLI. */
    command: string
    /** Adapter-verified identity string, such as a version or product marker. */
    identity?: string
  }
}

export type HealthFacet = {
  check(): Promise<HealthReport>
}

export type HealthReport = { success: true } | { success: false; message: string }

export type ProcessFacet = {
  plan<Output extends RunOutputRequest = TextOutputRequest>(request: RunRequest<Output>): Promise<CommandPlan<Output>>
  run<Output extends RunOutputRequest = TextOutputRequest>(request: RunRequest<Output>): Promise<HarnessRun<Output>>
  run<Output extends RunOutputRequest = TextOutputRequest>(plan: CommandPlan<Output>): Promise<HarnessRun<Output>>
}

export type RunRequest<Output extends RunOutputRequest = TextOutputRequest> = {
  prompt: string
  /** Requested working directory before adapter resolution. */
  cwd?: string
  stdin?: string | Uint8Array
  /** Process environment patch requested by the caller for this run. */
  env?: Record<string, string | undefined>
  /** Defaults to text output when omitted. */
  output?: Output
  timeoutMs?: number
}

export type RunOutputRequest = TextOutputRequest | JsonlOutputRequest | StructuredOutputRequest

export type TextOutputRequest = { mode?: 'text' }

export type JsonlOutputRequest = { mode: 'jsonl' }

export type StructuredOutputRequest<Schema extends StandardSchemaV1 = StandardSchemaV1> = {
  mode: 'structured'
  schema: Schema
}

export type CommandPlan<Output extends RunOutputRequest = TextOutputRequest> = {
  harnessId: HarnessId
  /** Executable name or path to spawn; arguments stay in args. */
  command: string
  args: string[]
  /** Resolved working directory used by process.run. */
  cwd: string
  /** Process environment patch: string sets a variable, undefined removes it. */
  env?: Record<string, string | undefined>
  stdin?: string | Uint8Array
  output: Output
  timeoutMs?: number
}

export type HarnessRun<Output extends RunOutputRequest = TextOutputRequest> = {
  plan: CommandPlan<Output>
  stdout: AsyncIterable<Uint8Array>
  stderr: AsyncIterable<Uint8Array>
  events: AsyncIterable<HarnessRunEvent>
  result: Promise<HarnessRunResult<Output>>
  kill(signal?: string): void
}

export type HarnessRunEvent = { type: 'text'; text: string } | { type: 'json'; value: unknown }

export type HarnessRunResult<Output extends RunOutputRequest = TextOutputRequest> = {
  exitCode: number | null
  signal?: string
  finalText: string
} & StructuredRunResult<Output>

export type StructuredRunResult<Output extends RunOutputRequest> =
  Output extends StructuredOutputRequest<infer Schema>
    ? { structured: StandardSchemaV1.InferOutput<Schema> }
    : { structured?: never }

export type ExtensionFacet = {
  check(extension: HarnessExtension): Promise<ExtensionCheckResult>
  install(extension: HarnessExtension): Promise<ExtensionResult>
  uninstall(extensionId: string): Promise<ExtensionResult>
}

export type HarnessExtension = {
  /** Stable extension id used by adapter-owned install records and uninstall. */
  id: string
  resources: ExtensionResources
}

export type ExtensionResources = {
  /** Filesystem paths to skill files or directories; relative paths resolve from HarnessContext.cwd. */
  skills?: string[]
  hooks?: HookResource[]
  mcpServers?: Record<string, McpServerResource>
}

export type ExtensionResourceKind = keyof ExtensionResources

export type McpServerResource = {
  /** Executable name or path for the stdio MCP server; arguments stay in args. */
  command: string
  args?: string[]
  /** Environment variables added for this MCP server process. */
  env?: Record<string, string>
}

export type HookResource = {
  /** Stable hook resource name within this extension. */
  name: string
  /** Native hook event name validated by the adapter. */
  event: string
  /** Command string installed into the target harness native hook config. */
  command: string
}

export type ExtensionResult = {
  success: boolean
  issues: ExtensionIssue[]
}

export type ExtensionCheckResult = {
  compatible: boolean
  issues: ExtensionIssue[]
}

export type ExtensionIssue =
  | { kind: 'unsupported'; resourceKind: ExtensionResourceKind; resourceName?: string; reason: string }
  | { kind: 'conflict'; resourceKind?: ExtensionResourceKind; resourceName?: string; reason: string }
