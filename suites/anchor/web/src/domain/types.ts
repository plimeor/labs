export type NoteKind = 'journal' | 'note' | 'reference' | 'proposal'
export type ActorType = 'user' | 'agent' | 'system'
export type AgentMode = 'explore' | 'ask' | 'execute'
export type PermissionMode = 'safe' | 'ask' | 'allow-all'
export type PermissionModeCanonical = AgentMode
export type ApprovalState = 'draft' | 'pending' | 'accepted' | 'rejected'
export type GraphLayer = 'core' | 'agents'
export type RelationSource =
  | 'manual_link'
  | 'property_link'
  | 'tag_membership'
  | 'source_supported'
  | 'agent_inferred'
  | 'user_confirmed'

export interface NoteMetadata {
  id: string
  kind: NoteKind
  title: string
  type?: string
  created: string
  updated: string
  aliases: string[]
  tags: string[]
  properties: Record<string, string>
  journalDate?: string
  sourceRefs?: SourceRef[]
  proposalState?: ApprovalState
}

export interface NoteRecord {
  body: string
  checksum: string
  filePath: string
  metadata: NoteMetadata
  revision: string
}

export interface NoteSummary {
  checksum: string
  filePath: string
  id: string
  kind: NoteKind
  title: string
  type?: string
  updated: string
  tags: string[]
}

export interface SourceSpan {
  start: number
  end: number
  context: 'body' | 'frontmatter' | 'code_fence' | 'inline_code' | 'link_text' | 'html'
}

export interface LinkProjection {
  alias?: string
  fromNoteId: string
  rawTarget: string
  resolvedNoteId?: string
  source: RelationSource
  span: SourceSpan
  status: 'resolved' | 'unresolved' | 'ambiguous'
}

export interface MentionProjection {
  candidateNoteId: string
  candidateTitle: string
  sourceNoteId: string
  span: SourceSpan
}

export interface GraphEdge {
  fromNoteId: string
  graphLayer: GraphLayer
  id: string
  source: RelationSource
  status: 'core' | 'candidate' | 'rejected'
  toNoteId: string
  type: 'link' | 'property' | 'reference' | 'proposal'
}

export interface GraphNode {
  id: string
  kind: NoteKind
  title: string
  type?: string
}

export interface GraphNeighborhood {
  depth: 1 | 2
  edges: GraphEdge[]
  nodes: GraphNode[]
}

export interface SearchRequest {
  count?: boolean
  fields: Array<'id' | 'title' | 'snippet' | 'metadata' | 'body'>
  limit: number
  query: string
  scope: SearchScope
  tag?: string
  type?: string
  propertyKey?: string
  propertyValue?: string
}

export interface SearchScope {
  kind: 'all' | 'current_note_neighborhood' | 'date_range' | 'tag' | 'object_type' | 'folder'
  value?: string
}

export interface SearchResult {
  body?: string
  id: string
  kind: NoteKind
  matchedFields: string[]
  metadata?: NoteMetadata
  pathHint: string
  snippet?: string
  title: string
  type?: string
}

export interface MetadataPatch {
  aliases?: string[]
  properties?: Record<string, string>
  tags?: string[]
  title?: string
  type?: string
}

export interface UpdateNoteInput {
  baseRevision: string
  body?: string
  metadataPatch?: MetadataPatch
  noteId: string
}

export interface OperationRecord {
  actorId: string
  actorType: ActorType
  approvalState: ApprovalState
  baseRevisions: Record<string, string>
  graphImpactSummary: string
  id: string
  mode: AgentMode | 'manual'
  operationType: string
  provenance: string
  resultingRevisions: Record<string, string>
  targetNoteIds: string[]
  timestamp: string
}

export interface DiffHunk {
  after: string
  before: string
  noteId: string
  title: string
}

export interface ProposedChange {
  approvalState: ApprovalState
  baseRevisions: Record<string, string>
  createdAt: string
  diff: DiffHunk[]
  graphImpact: string
  id: string
  metadataImpact: string
  mode: AgentMode
  provenance: string
  targetNoteIds: string[]
}

export interface SourceRef {
  id: string
  label: string
  noteId?: string
  snapshot?: string
}

export interface AgentConnection {
  authState: 'not_required' | 'available' | 'unavailable'
  capabilities: string[]
  defaultMode: PermissionMode
  displayName: string
  healthState: 'available' | 'unavailable'
  id: string
  type: 'internal_dev' | 'acp_checkpoint' | 'built_in_provider_checkpoint'
}

export interface PermissionModeState {
  changedAt: string
  changedBy: 'user' | 'system' | 'restore' | 'automation' | 'unknown'
  modeVersion: number
  permissionMode: PermissionMode
  previousPermissionMode?: PermissionMode
  transitionDisplay?: string
}

export interface TaskContext {
  attachments: string[]
  dateRange?: string
  explicitSources: SourceRef[]
  objectType?: string
  scope: SearchScope | { kind: 'none' }
  tag?: string
  targetNoteId?: string
}

export interface TimelineEvent {
  detail: string
  id: string
  timestamp: string
  type: 'user_message' | 'agent_message' | 'plan' | 'tool_call' | 'permission_request' | 'result'
}

export type ToolStatus = 'pending' | 'executing' | 'completed' | 'error' | 'backgrounded'
export type AgentMessageRole =
  | 'user'
  | 'assistant'
  | 'tool'
  | 'status'
  | 'info'
  | 'warning'
  | 'error'
  | 'plan'
  | 'permission-request'

export interface PermissionRequest {
  approvalTtlSeconds?: number
  command?: string
  commandHash?: string
  description: string
  id: string
  impact?: string
  reason?: string
  rememberForMinutes?: number
  requiresSystemPrompt?: boolean
  status: 'pending' | 'approved' | 'rejected'
  toolName: string
  type: 'bash' | 'file_write' | 'mcp_mutation' | 'api_mutation' | 'admin_approval' | 'notes_operation'
}

export interface AgentMessage {
  content: string
  id: string
  isBackground?: boolean
  isError?: boolean
  isIntermediate?: boolean
  isPending?: boolean
  isStreaming?: boolean
  parentToolUseId?: string
  permissionRequest?: PermissionRequest
  role: AgentMessageRole
  taskId?: string
  timestamp: number
  toolDisplayName?: string
  toolInput?: Record<string, unknown>
  toolIntent?: string
  toolName?: string
  toolResult?: string
  toolStatus?: ToolStatus
  toolUseId?: string
  turnId?: string
}

export interface AgentTask {
  connectionId: string
  context: TaskContext
  id: string
  messages: AgentMessage[]
  mode: AgentMode
  permissionModeState: PermissionModeState
  outputs: AgentOutput[]
  title: string
  timeline: TimelineEvent[]
}

export type AgentOutput =
  | { id: string; kind: 'draft'; title: string; markdown: string }
  | { id: string; kind: 'reference'; noteId: string; title: string; sourceRefs: SourceRef[] }
  | { id: string; kind: 'proposal'; noteId: string; title: string }
  | { id: string; kind: 'proposed_change'; proposedChangeId: string; title: string }

export interface ObjectTypeProjection {
  notes: NoteSummary[]
  recommendedProperties: string[]
  type: string
}

export interface VaultDiagnostics {
  appVersion: string
  backend: 'tauri' | 'local-demo'
  cachePath?: string
  currentVault?: string
  health: 'ok' | 'degraded'
  indexStatus: 'not_open' | 'complete' | 'partial'
  platform: string
  warnings: string[]
}

export interface AnchorBackend {
  applyProposedChange(id: string): Promise<{ note: NoteRecord; operation: OperationRecord }>
  createAgentTask(input: { permissionMode: PermissionMode; title: string; targetNoteId?: string }): Promise<AgentTask>
  createNote(input: { title: string; body?: string; type?: string }): Promise<NoteRecord>
  createProposedChange(input: {
    noteId: string
    mode: AgentMode
    bodyAppend: string
    provenance: string
  }): Promise<ProposedChange>
  diagnostics(): Promise<VaultDiagnostics>
  getBacklinks(noteId: string): Promise<LinkProjection[]>
  getGraphNeighborhood(noteId: string, depth: 1 | 2): Promise<GraphNeighborhood>
  getLinks(noteId: string): Promise<LinkProjection[]>
  getObjectTypes(): Promise<ObjectTypeProjection[]>
  getProposedChanges(): Promise<ProposedChange[]>
  getUnlinkedMentions(noteId: string): Promise<MentionProjection[]>
  listAgentConnections(): Promise<AgentConnection[]>
  listAgentTasks(): Promise<AgentTask[]>
  listNotes(): Promise<NoteSummary[]>
  listOperationRecords(): Promise<OperationRecord[]>
  openDemoVault(): Promise<VaultDiagnostics>
  openVault(): Promise<VaultDiagnostics | undefined>
  openTodayJournal(): Promise<NoteRecord>
  readNote(noteId: string): Promise<NoteRecord>
  rejectProposedChange(id: string): Promise<ProposedChange>
  searchNotes(request: SearchRequest): Promise<SearchResult[]>
  setTaskPermissionMode(taskId: string, mode: PermissionMode): Promise<AgentTask>
  updateNote(input: UpdateNoteInput): Promise<NoteRecord>
}
