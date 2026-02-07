export type ScheduleType = 'cron' | 'interval' | 'once'

export type ContextMode = 'isolated' | 'main'

export type TaskStatus = 'active' | 'paused' | 'completed'

export type MessageRole = 'user' | 'assistant'

export type PermissionMode = 'safe' | 'ask' | 'allow-all'

export interface AgentMetadata {
  name: string
  description?: string
  status: 'active' | 'inactive'
  model?: string
  permissionMode?: PermissionMode
  createdAt: string
  lastActiveAt: string | null
}

export interface TaskData {
  id: string
  agentName: string
  name: string | null
  prompt: string
  scheduleType: ScheduleType
  scheduleValue: string
  contextMode: ContextMode
  status: TaskStatus
  nextRun: string | null
  lastRun: string | null
  createdAt: string
}

export interface InboxMessage {
  id: string
  fromAgent: string
  toAgent: string
  message: string
  messageType: 'request' | 'response'
  requestId?: string
  status: 'pending' | 'read' | 'archived'
  claimedBy?: string
  claimedAt?: string
  createdAt: string
  readAt: string | null
}

export interface SessionMetadata {
  id: string
  title?: string
  sdkSessionId?: string
  model?: string
  permissionMode?: string
  createdAt: string
  lastMessageAt: string | null
  messageCount: number
}

export interface SessionMessage {
  role: MessageRole
  content: string
  timestamp: string
}
