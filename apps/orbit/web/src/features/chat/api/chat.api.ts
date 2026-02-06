const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface SendMessageResponse {
  response: string
  sessionId: string
}

export interface ChatHistoryResponse {
  session: {
    id: string
    agentName: string
    startedAt: string
    messageCount: number
  }
  messages: ChatMessage[]
}

export interface Agent {
  name: string
  displayName: string
  status: string
  lastActiveAt: string | null
  createdAt: string
}

export async function sendMessage(
  agentName: string,
  message: string,
  sessionId?: string
): Promise<SendMessageResponse> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agentName,
      message,
      sessionId
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`)
  }

  return response.json()
}

export async function getChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  const response = await fetch(`${API_BASE}/api/chat/history/${sessionId}`)

  if (!response.ok) {
    throw new Error(`Failed to get chat history: ${response.statusText}`)
  }

  return response.json()
}

export async function listAgents(): Promise<{ agents: Agent[] }> {
  const response = await fetch(`${API_BASE}/api/agents`)

  if (!response.ok) {
    throw new Error(`Failed to list agents: ${response.statusText}`)
  }

  return response.json()
}

export async function createAgent(name: string, displayName?: string, description?: string): Promise<{ agent: Agent }> {
  const response = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, displayName, description })
  })

  if (!response.ok) {
    throw new Error(`Failed to create agent: ${response.statusText}`)
  }

  return response.json()
}
