/**
 * API route constants
 */
export const API_ROUTES = {
  BASE: '/api',
  HEALTH: '/health',

  // Chat
  CHAT: '/api/chat',
  CHAT_SYNC: '/api/chat/sync',
  CHAT_HISTORY: '/api/chat/history',

  // Agents
  AGENTS: '/api/agents',

  // Tasks
  TASKS: '/api/tasks'
} as const
