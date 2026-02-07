// API client for Orbit server
// Uses Vite proxy: /api -> localhost:3001

export interface Agent {
  name: string
  status: string
  createdAt: string
  lastActiveAt: string | null
}

export interface Session {
  id: string
  title?: string
  sdkSessionId?: string
  model?: string
  createdAt: string
  lastMessageAt: string
  messageCount: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface InboxMessage {
  id: string
  fromAgent: string
  toAgent: string
  message: string
  messageType: string
  status: string
  claimedBy?: string
  createdAt: string
}

export interface Task {
  id: string
  agentName: string
  name: string
  prompt: string
  scheduleType: 'cron' | 'interval' | 'once'
  scheduleValue: string
  contextMode: 'isolated' | 'main'
  status: string
  nextRun?: string
  lastRun?: string
}

// SSE streaming helper
export async function streamChat(
  params: {
    agentName: string
    message: string
    sessionId?: string
    model?: string
  },
  callbacks: {
    onSessionId?: (sessionId: string) => void
    onText?: (text: string) => void
    onResult?: (result: string) => void
    onError?: (error: string) => void
    onToolUse?: (data: { id?: string; name?: string; input?: unknown }) => void
  },
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal
  })

  if (!response.ok) throw new Error(`Chat failed: ${response.statusText}`)
  if (!response.body) throw new Error('No response body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6)) as Record<string, unknown>
        switch (data.type) {
          case 'system': {
            const sessionId = data.session_id
            if (typeof sessionId === 'string') {
              callbacks.onSessionId?.(sessionId)
            }
            break
          }
          case 'assistant': {
            const message = data.message as { content?: Array<{ type: string; text?: string }> } | undefined
            if (message?.content) {
              for (const block of message.content) {
                if (block.type === 'text' && block.text) {
                  callbacks.onText?.(block.text)
                }
              }
            }
            break
          }
          case 'content_block_delta': {
            const delta = data.delta as { type?: string; text?: string } | undefined
            if (delta?.type === 'text_delta' && delta.text) {
              callbacks.onText?.(delta.text)
            }
            break
          }
          case 'result': {
            const result = data.result
            callbacks.onResult?.(typeof result === 'string' ? result : '')
            break
          }
          case 'error': {
            const message = data.message
            callbacks.onError?.(typeof message === 'string' ? message : 'Unknown error')
            break
          }
          case 'tool_use': {
            callbacks.onToolUse?.({
              id: typeof data.id === 'string' ? data.id : undefined,
              name: typeof data.name === 'string' ? data.name : undefined,
              input: typeof data.input === 'object' && data.input !== null ? data.input : undefined
            })
            break
          }
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }
}

async function fetchJSON<T = unknown>(url: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(url, {
    method: opts?.method || 'GET',
    headers: opts?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined
  })
  if (!response.ok) throw new Error(`API error: ${response.status}`)
  return response.json() as Promise<T>
}

export const api = {
  agents: {
    list: () => fetchJSON<{ agents: Agent[] }>('/api/agents'),
    create: (name: string, description?: string) =>
      fetchJSON<{ agent: Agent }>('/api/agents', {
        method: 'POST',
        body: { name, description }
      }),
    get: (name: string) => fetchJSON<{ agent: Agent }>(`/api/agents/${name}`),
    update: (name: string, body: Record<string, unknown>) =>
      fetchJSON<{ agent: Agent }>(`/api/agents/${name}`, {
        method: 'PUT',
        body
      }),
    delete: (name: string) => fetchJSON(`/api/agents/${name}`, { method: 'DELETE' })
  },
  sessions: {
    list: (agentName: string) => fetchJSON<{ sessions: Session[] }>(`/api/agents/${agentName}/sessions`),
    create: (agentName: string, body?: { title?: string; model?: string }) =>
      fetchJSON<{ session: Session }>(`/api/agents/${agentName}/sessions`, { method: 'POST', body: body || {} }),
    get: (agentName: string, id: string) =>
      fetchJSON<{ session: Session; messages: ChatMessage[] }>(`/api/agents/${agentName}/sessions/${id}`),
    update: (agentName: string, id: string, body: { title?: string }) =>
      fetchJSON(`/api/agents/${agentName}/sessions/${id}`, {
        method: 'PUT',
        body
      }),
    delete: (agentName: string, id: string) =>
      fetchJSON(`/api/agents/${agentName}/sessions/${id}`, {
        method: 'DELETE'
      })
  },
  inbox: {
    list: (agentName: string) => fetchJSON<{ messages: InboxMessage[] }>(`/api/agents/${agentName}/inbox`),
    archive: (agentName: string, msgId: string) =>
      fetchJSON(`/api/agents/${agentName}/inbox/${msgId}`, {
        method: 'DELETE'
      })
  },
  tasks: {
    listAll: () => fetchJSON<{ tasks: Task[] }>('/api/tasks'),
    list: (agentName: string) => fetchJSON<{ tasks: Task[] }>(`/api/agents/${agentName}/tasks`),
    create: (
      agentName: string,
      body: {
        prompt: string
        scheduleType: 'cron' | 'interval' | 'once'
        scheduleValue: string
        contextMode: 'isolated' | 'main'
        name?: string
      }
    ) =>
      fetchJSON<{ task: Task }>(`/api/agents/${agentName}/tasks`, {
        method: 'POST',
        body
      }),
    update: (agentName: string, id: string, body: { status?: string; prompt?: string; name?: string }) =>
      fetchJSON(`/api/agents/${agentName}/tasks/${id}`, {
        method: 'PUT',
        body
      }),
    delete: (agentName: string, id: string) =>
      fetchJSON(`/api/agents/${agentName}/tasks/${id}`, {
        method: 'DELETE'
      })
  }
}
