import { create } from 'zustand'

import type { ChatMessage, Session } from '@/lib/api'
import { api, streamChat } from '@/lib/api'
import { useUIStore } from '@/stores/ui.store'

export interface ToolEvent {
  id: string
  name: string
  status: 'running' | 'complete'
  input?: Record<string, unknown>
  timestamp: string
}

interface SessionState {
  sessions: Record<string, Session[]>
  messages: Record<string, ChatMessage[]>
  streaming: string | null
  isStreaming: boolean
  toolEvents: Record<string, ToolEvent[]>
  error: string | null
  abortController: AbortController | null
  fetchSessions: (agentName: string) => Promise<void>
  fetchMessages: (agentName: string, sessionId: string) => Promise<void>
  createSession: (agentName: string) => Promise<Session>
  deleteSession: (agentName: string, sessionId: string) => Promise<void>
  sendMessage: (agentName: string, sessionId: string | null, message: string) => Promise<string | null>
  abortStream: () => void
  clearError: () => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: {},
  messages: {},
  streaming: null,
  isStreaming: false,
  toolEvents: {},
  error: null,
  abortController: null,

  fetchSessions: async agentName => {
    try {
      const { sessions } = await api.sessions.list(agentName)
      set(s => ({
        sessions: { ...s.sessions, [agentName]: sessions }
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch sessions'
      })
    }
  },

  fetchMessages: async (agentName, sessionId) => {
    try {
      const { messages } = await api.sessions.get(agentName, sessionId)
      set(s => ({
        messages: { ...s.messages, [sessionId]: messages }
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch messages'
      })
    }
  },

  createSession: async agentName => {
    const { session } = await api.sessions.create(agentName)
    set(s => ({
      sessions: {
        ...s.sessions,
        [agentName]: [session, ...(s.sessions[agentName] || [])]
      }
    }))
    return session
  },

  deleteSession: async (agentName, sessionId) => {
    await api.sessions.delete(agentName, sessionId)
    set(s => ({
      sessions: {
        ...s.sessions,
        [agentName]: (s.sessions[agentName] || []).filter(sess => sess.id !== sessionId)
      }
    }))
  },

  sendMessage: async (agentName, sessionId, message) => {
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    }

    // Determine the key for messages - use sessionId if we have one, otherwise temp key
    const msgKey = sessionId || `pending-${agentName}`

    set(s => ({
      messages: {
        ...s.messages,
        [msgKey]: [...(s.messages[msgKey] || []), userMsg]
      },
      streaming: null,
      isStreaming: true,
      error: null
    }))

    const controller = new AbortController()
    set({ abortController: controller })

    let resolvedSessionId = sessionId
    let accumulatedText = ''
    let sessionResolved = false

    try {
      await streamChat(
        {
          agentName,
          message,
          sessionId: sessionId || undefined
        },
        {
          onSessionId: sid => {
            // Only handle the first session_id (orbit session), ignore SDK session_id
            if (sessionResolved) return
            sessionResolved = true
            resolvedSessionId = sid
            // If we were using a pending key, move messages to real session key
            if (!sessionId) {
              const state = get()
              const pendingMessages = state.messages[msgKey] || []
              set(s => ({
                messages: {
                  ...s.messages,
                  [sid]: pendingMessages,
                  [msgKey]: undefined as unknown as ChatMessage[]
                }
              }))
              // Update active session so useChat reads from the correct key
              useUIStore.setState({ activeSessionId: sid })
            }
          },
          onText: text => {
            accumulatedText += text
            set({ streaming: accumulatedText })
          },
          onResult: result => {
            const finalText = result || accumulatedText
            const finalKey = resolvedSessionId || msgKey
            const assistantMsg: ChatMessage = {
              role: 'assistant',
              content: finalText,
              timestamp: new Date().toISOString()
            }
            set(s => ({
              messages: {
                ...s.messages,
                [finalKey]: [...(s.messages[finalKey] || []), assistantMsg]
              },
              streaming: null,
              isStreaming: false,
              abortController: null
            }))
            set(s => {
              const key = resolvedSessionId || msgKey
              const events = s.toolEvents[key]
              if (!events) return s
              return {
                toolEvents: {
                  ...s.toolEvents,
                  [key]: events.map(e => (e.status === 'running' ? { ...e, status: 'complete' as const } : e))
                }
              }
            })
          },
          onError: error => {
            set({ error, streaming: null, isStreaming: false, abortController: null })
          },
          onToolUse: data => {
            if (!data.name) return
            const finalKey = resolvedSessionId || msgKey
            const event: ToolEvent = {
              id: data.id || crypto.randomUUID(),
              name: data.name,
              status: 'running',
              input:
                typeof data.input === 'object' && data.input !== null
                  ? (data.input as Record<string, unknown>)
                  : undefined,
              timestamp: new Date().toISOString()
            }
            set(s => ({
              toolEvents: {
                ...s.toolEvents,
                [finalKey]: [...(s.toolEvents[finalKey] || []), event]
              }
            }))
          }
        },
        controller.signal
      )

      // If stream ended without a result event, finalize with accumulated text
      const state = get()
      if (state.isStreaming && accumulatedText) {
        const finalKey = resolvedSessionId || msgKey
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: accumulatedText,
          timestamp: new Date().toISOString()
        }
        set(s => ({
          messages: {
            ...s.messages,
            [finalKey]: [...(s.messages[finalKey] || []), assistantMsg]
          },
          streaming: null,
          isStreaming: false,
          abortController: null
        }))
      } else if (state.isStreaming) {
        set({ isStreaming: false, abortController: null })
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        set({
          error: err instanceof Error ? err.message : 'Stream failed',
          streaming: null,
          isStreaming: false,
          abortController: null
        })
      } else {
        // Aborted: finalize any partial text
        if (accumulatedText) {
          const finalKey = resolvedSessionId || msgKey
          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: accumulatedText,
            timestamp: new Date().toISOString()
          }
          set(s => ({
            messages: {
              ...s.messages,
              [finalKey]: [...(s.messages[finalKey] || []), assistantMsg]
            },
            streaming: null,
            isStreaming: false,
            abortController: null
          }))
        } else {
          set({ streaming: null, isStreaming: false, abortController: null })
        }
      }
    }

    return resolvedSessionId
  },

  abortStream: () => {
    const { abortController } = get()
    abortController?.abort()
  },

  clearError: () => set({ error: null })
}))
