import type {
  AgentMessage,
  AgentMode,
  PermissionMode,
  PermissionModeCanonical,
  PermissionRequest,
  ToolStatus
} from './types'

export const permissionModeOrder: PermissionMode[] = ['safe', 'ask', 'allow-all']

export const permissionModeConfig: Record<
  PermissionMode,
  { canonical: PermissionModeCanonical; description: string; displayName: string; shortName: string }
> = {
  'allow-all': {
    canonical: 'execute',
    description: 'Runs approved policy operations automatically inside the task scope.',
    displayName: 'Execute',
    shortName: 'Execute'
  },
  ask: {
    canonical: 'ask',
    description: 'Prompts before file, metadata, graph, or operation mutations.',
    displayName: 'Ask to Edit',
    shortName: 'Ask'
  },
  safe: {
    canonical: 'explore',
    description: 'Read-only exploration. Blocks writes and never prompts.',
    displayName: 'Explore',
    shortName: 'Explore'
  }
}

export function toCanonicalMode(mode: PermissionMode): AgentMode {
  return permissionModeConfig[mode].canonical
}

export function fromCanonicalMode(mode: AgentMode): PermissionMode {
  if (mode === 'explore') return 'safe'
  if (mode === 'execute') return 'allow-all'
  return 'ask'
}

export interface ActivityItem {
  content?: string
  depth: number
  displayName?: string
  error?: string
  id: string
  parentId?: string
  permissionRequest?: PermissionRequest
  status: 'pending' | 'running' | 'completed' | 'error' | 'backgrounded'
  timestamp: number
  toolInput?: Record<string, unknown>
  toolIntent?: string
  toolName?: string
  toolResult?: string
  toolUseId?: string
  type: 'tool' | 'intermediate' | 'status' | 'plan' | 'permission'
}

export interface AssistantTurn {
  activities: ActivityItem[]
  isComplete: boolean
  isStreaming: boolean
  response?: {
    isStreaming: boolean
    messageId: string
    text: string
  }
  timestamp: number
  turnId: string
  type: 'assistant'
}

export interface UserTurn {
  message: AgentMessage
  timestamp: number
  type: 'user'
}

export interface SystemTurn {
  message: AgentMessage
  timestamp: number
  type: 'system'
}

export type AgentTurn = AssistantTurn | UserTurn | SystemTurn
export type TurnPhase = 'pending' | 'tool_active' | 'awaiting' | 'streaming' | 'complete'

export function deriveTurnPhase(turn: AssistantTurn): TurnPhase {
  if (turn.isComplete) return 'complete'
  if (turn.response?.isStreaming) return 'streaming'
  if (turn.activities.some(activity => activity.type === 'tool' && activity.status === 'running')) return 'tool_active'
  if (turn.activities.length > 0) return 'awaiting'
  return 'pending'
}

export function shouldShowThinkingIndicator(phase: TurnPhase): boolean {
  return phase === 'pending' || phase === 'awaiting'
}

export function groupAgentMessagesByTurn(messages: AgentMessage[], isSessionProcessing = false): AgentTurn[] {
  const sortedMessages = [...messages].sort((left, right) => left.timestamp - right.timestamp)
  const turns: AgentTurn[] = []
  let currentTurn: AssistantTurn | null = null

  const flushCurrentTurn = () => {
    if (!currentTurn) {
      return
    }

    currentTurn.activities.sort((left, right) => left.timestamp - right.timestamp)
    calculateActivityDepths(currentTurn.activities)

    if (!currentTurn.response && currentTurn.isComplete && currentTurn.activities.length > 0) {
      const lastIntermediate = [...currentTurn.activities].reverse().find(activity => activity.type === 'intermediate')
      if (lastIntermediate?.content) {
        currentTurn.response = {
          isStreaming: false,
          messageId: lastIntermediate.id,
          text: lastIntermediate.content
        }
      }
    }

    turns.push(currentTurn)
    currentTurn = null
  }

  const ensureAssistantTurn = (message: AgentMessage) => {
    if (!currentTurn) {
      currentTurn = {
        activities: [],
        isComplete: false,
        isStreaming: true,
        timestamp: message.timestamp,
        turnId: message.turnId ?? message.id,
        type: 'assistant'
      }
    }
    return currentTurn
  }

  const markCurrentTurnComplete = () => {
    const turn = currentTurn as AssistantTurn | null
    if (turn) {
      turn.isComplete = true
    }
  }

  for (const message of sortedMessages) {
    if (message.role === 'user') {
      markCurrentTurnComplete()
      flushCurrentTurn()
      turns.push({ message, timestamp: message.timestamp, type: 'user' })
      continue
    }

    if (message.role === 'error' || message.role === 'warning' || message.role === 'info') {
      markCurrentTurnComplete()
      flushCurrentTurn()
      turns.push({ message, timestamp: message.timestamp, type: 'system' })
      continue
    }

    if (message.role === 'status') {
      ensureAssistantTurn(message).activities.push({
        content: message.content,
        depth: 0,
        id: message.id,
        status: 'running',
        timestamp: message.timestamp,
        type: 'status'
      })
      continue
    }

    if (message.role === 'plan') {
      const turn = ensureAssistantTurn(message)
      turn.activities.push({
        content: message.content,
        depth: 0,
        displayName: 'Plan',
        id: message.id,
        status: 'completed',
        timestamp: message.timestamp,
        type: 'plan'
      })
      turn.isComplete = true
      turn.isStreaming = false
      flushCurrentTurn()
      continue
    }

    if (message.role === 'permission-request') {
      const turn = ensureAssistantTurn(message)
      turn.activities.push({
        content: message.content,
        depth: 0,
        displayName: 'Permission request',
        id: message.id,
        permissionRequest: message.permissionRequest,
        status: message.permissionRequest?.status === 'pending' ? 'pending' : 'completed',
        timestamp: message.timestamp,
        type: 'permission'
      })
      turn.isStreaming = false
      continue
    }

    if (message.role === 'tool') {
      const turn = ensureAssistantTurn(message)
      turn.activities.push(messageToActivity(message, turn.activities))
      turn.isStreaming = !isToolTerminal(message.toolStatus)
      continue
    }

    if (message.role === 'assistant') {
      const turn = ensureAssistantTurn(message)

      if (message.isIntermediate || message.isPending) {
        turn.activities.push({
          content: message.content,
          depth: 0,
          id: message.id,
          parentId: message.parentToolUseId,
          status: message.isPending ? 'running' : 'completed',
          timestamp: message.timestamp,
          type: 'intermediate'
        })
        turn.isStreaming = !!message.isPending
        continue
      }

      turn.response = {
        isStreaming: !!message.isStreaming,
        messageId: message.id,
        text: message.content
      }
      turn.isComplete = !message.isStreaming
      turn.isStreaming = !!message.isStreaming

      if (!message.isStreaming) {
        flushCurrentTurn()
      }
    }
  }

  const finalTurn = currentTurn as AssistantTurn | null
  if (!isSessionProcessing && finalTurn && finalTurn.activities.length > 0) {
    finalTurn.isComplete = true
    finalTurn.isStreaming = false
  }

  flushCurrentTurn()
  return turns
}

function calculateActivityDepths(activities: ActivityItem[]): void {
  const toolIdToActivity = new Map<string, ActivityItem>()
  for (const activity of activities) {
    if (activity.toolUseId) {
      toolIdToActivity.set(activity.toolUseId, activity)
    }
  }

  for (const activity of activities) {
    let depth = 0
    let parentId = activity.parentId
    while (parentId && depth < 10) {
      depth += 1
      parentId = toolIdToActivity.get(parentId)?.parentId
    }
    activity.depth = depth
  }
}

function isToolTerminal(status?: ToolStatus): boolean {
  return status === 'completed' || status === 'error'
}

function messageToActivity(message: AgentMessage, existingActivities: ActivityItem[]): ActivityItem {
  const parent = message.parentToolUseId
    ? existingActivities.find(activity => activity.toolUseId === message.parentToolUseId)
    : undefined

  return {
    content: message.toolResult ?? message.content,
    depth: parent ? parent.depth + 1 : 0,
    displayName: message.toolDisplayName,
    error: message.isError ? stripErrorPrefix(message.toolResult ?? message.content) : undefined,
    id: message.id,
    parentId: message.parentToolUseId,
    status: toActivityStatus(message),
    timestamp: message.timestamp,
    toolInput: message.toolInput,
    toolIntent: message.toolIntent,
    toolName: message.toolName,
    toolResult: message.toolResult,
    toolUseId: message.toolUseId,
    type: 'tool'
  }
}

function stripErrorPrefix(content: string | undefined): string | undefined {
  return content?.replace(/^\[ERROR]\s*/i, '').trim()
}

function toActivityStatus(message: AgentMessage): ActivityItem['status'] {
  if (message.isError) return 'error'
  if (message.toolStatus === 'backgrounded') return 'backgrounded'
  if (message.toolStatus === 'completed' || message.toolResult !== undefined) return 'completed'
  if (message.toolStatus === 'pending') return 'pending'
  return 'running'
}
