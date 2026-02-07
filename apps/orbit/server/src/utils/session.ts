import type { SessionMetadata } from '@orbit/shared/types'

import type { AgentStore } from '@/stores/agent.store'
import type { SessionStore } from '@/stores/session.store'

/**
 * Resolve an existing session or create a new one.
 * Returns undefined if sessionId was provided but not found.
 */
export async function resolveOrCreateSession(
  agentStore: AgentStore,
  sessionStore: SessionStore,
  agentName: string,
  sessionId?: string
): Promise<SessionMetadata | undefined> {
  await agentStore.ensure(agentName)
  if (sessionId) {
    return sessionStore.get(agentName, sessionId)
  }
  return sessionStore.create(agentName, {})
}
