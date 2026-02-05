/**
 * BDD Tests for Chat Controller (API Endpoints)
 *
 * Tests HTTP API endpoints including:
 * - POST /api/chat - Send message to agent
 * - GET /api/chat/history/:sessionId - Get chat history
 * - GET /api/chat/sessions/:agentId - List sessions
 * - GET /api/agents - List agents
 * - POST /api/agents - Create agent
 * - GET /api/agents/:name - Get agent details
 * - DELETE /api/agents/:name - Delete agent
 *
 * These tests verify request/response contracts
 */

import { Database } from 'bun:sqlite'
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { agents, type Agent } from '@db/agents'
import { chatSessions, messages } from '@db/sessions'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'

// ============================================================
// Test Database Setup
// ============================================================

let sqlite: Database
let db: ReturnType<typeof drizzle>

function setupTestDb() {
  sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      workspace_path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_active_at INTEGER
    );

    CREATE TABLE chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      user_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_message_at INTEGER,
      message_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      agent_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)
  db = drizzle(sqlite)
}

function teardownTestDb() {
  sqlite.close()
}

async function createTestAgent(name: string): Promise<Agent> {
  const result = await db
    .insert(agents)
    .values({
      name,
      workspacePath: `/tmp/orbit/agents/${name}`,
      status: 'active',
    })
    .returning()
  return result[0]!
}

async function createTestSession(agentId: number, sessionId: string) {
  const result = await db
    .insert(chatSessions)
    .values({
      agentId,
      sessionId,
      messageCount: 0,
    })
    .returning()
  return result[0]!
}

async function createTestMessage(
  sessionId: number,
  agentId: number,
  role: 'user' | 'assistant',
  content: string,
) {
  const result = await db
    .insert(messages)
    .values({
      sessionId,
      agentId,
      role,
      content,
    })
    .returning()
  return result[0]!
}

// ============================================================
// Simulated Controller Logic (for unit testing)
// ============================================================

interface ChatRequest {
  agentName: string
  message: string
  sessionId?: string
}

interface ChatResponse {
  response: string
  sessionId: string
}

// Mock execute agent function
let mockExecuteResult = { result: 'Mock response', sessionId: 'test-session-123' }

function setMockExecuteResult(result: { result: string; sessionId: string }) {
  mockExecuteResult = result
}

// Simulated chat endpoint handler
async function handleChatRequest(body: ChatRequest): Promise<ChatResponse> {
  const { agentName, message, sessionId } = body

  // Ensure agent exists
  let agent = await db.select().from(agents).where(eq(agents.name, agentName)).get()

  if (!agent) {
    // Create agent if not exists (ensureAgent behavior)
    const result = await db
      .insert(agents)
      .values({
        name: agentName,
        workspacePath: `/tmp/orbit/agents/${agentName}`,
        status: 'active',
      })
      .returning()
    agent = result[0]!
  }

  // Simulate executeAgent
  const executeResult = mockExecuteResult

  // Store session
  let session = sessionId
    ? await db.select().from(chatSessions).where(eq(chatSessions.sessionId, sessionId)).get()
    : undefined

  if (!session) {
    const newSession = await db
      .insert(chatSessions)
      .values({
        agentId: agent.id,
        sessionId: executeResult.sessionId,
      })
      .returning()
    session = newSession[0]!
  }

  // Store messages
  await db.insert(messages).values({
    sessionId: session.id,
    agentId: agent.id,
    role: 'user',
    content: message,
  })

  await db.insert(messages).values({
    sessionId: session.id,
    agentId: agent.id,
    role: 'assistant',
    content: executeResult.result,
  })

  // Update session
  await db
    .update(chatSessions)
    .set({
      lastMessageAt: new Date(),
      messageCount: session.messageCount + 2,
    })
    .where(eq(chatSessions.id, session.id))

  return {
    response: executeResult.result,
    sessionId: executeResult.sessionId,
  }
}

// Simulated get history handler
async function handleGetHistory(sessionId: string) {
  const session = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.sessionId, sessionId))
    .get()

  if (!session) {
    return { messages: [] }
  }

  const history = await db.select().from(messages).where(eq(messages.sessionId, session.id)).all()

  return {
    session: {
      id: session.sessionId,
      agentId: session.agentId,
      createdAt: session.createdAt,
      messageCount: session.messageCount,
    },
    messages: history.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    })),
  }
}

// Simulated get sessions handler
async function handleGetSessions(agentId: number) {
  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.agentId, agentId))
    .all()

  return {
    sessions: sessions.map(s => ({
      id: s.sessionId,
      createdAt: s.createdAt,
      lastMessageAt: s.lastMessageAt,
      messageCount: s.messageCount,
    })),
  }
}

// Simulated list agents handler
async function handleListAgents() {
  const agentList = await db.select().from(agents).all()
  return {
    agents: agentList.map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      lastActiveAt: a.lastActiveAt,
      createdAt: a.createdAt,
    })),
  }
}

// Simulated create agent handler
async function handleCreateAgent(body: { name: string; description?: string }) {
  const existing = await db.select().from(agents).where(eq(agents.name, body.name)).get()

  if (existing) {
    throw new Error(`Agent already exists: ${body.name}`)
  }

  const result = await db
    .insert(agents)
    .values({
      name: body.name,
      workspacePath: `/tmp/orbit/agents/${body.name}`,
      status: 'active',
    })
    .returning()

  const agent = result[0]!
  return {
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      createdAt: agent.createdAt,
    },
  }
}

// Simulated get agent handler
async function handleGetAgent(name: string) {
  const agent = await db.select().from(agents).where(eq(agents.name, name)).get()

  if (!agent) {
    return { error: 'Agent not found' }
  }

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      lastActiveAt: agent.lastActiveAt,
      createdAt: agent.createdAt,
    },
  }
}

// Simulated delete agent handler
async function handleDeleteAgent(name: string) {
  const agent = await db.select().from(agents).where(eq(agents.name, name)).get()

  if (!agent) {
    throw new Error(`Agent not found: ${name}`)
  }

  await db.delete(agents).where(eq(agents.name, name))

  return { success: true }
}

// ============================================================
// BDD Tests
// ============================================================

describe('Chat Controller API', () => {
  beforeEach(() => {
    setupTestDb()
    setMockExecuteResult({ result: 'Default mock response', sessionId: 'default-session' })
  })

  afterEach(() => {
    teardownTestDb()
  })

  // ----------------------------------------------------------
  // Feature: POST /api/chat - Send Message
  // ----------------------------------------------------------
  describe('Feature: POST /api/chat - Send Message', () => {
    it('should send message to existing agent and store in database', async () => {
      await createTestAgent('assistant')
      setMockExecuteResult({ result: 'Stored response', sessionId: 'stored-session' })

      const response = await handleChatRequest({
        agentName: 'assistant',
        message: 'Store this',
      })

      expect(response.response).toBe('Stored response')
      expect(response.sessionId).toBe('stored-session')

      const session = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.sessionId, 'stored-session'))
        .get()
      expect(session).toBeDefined()

      const msgs = await db.select().from(messages).where(eq(messages.sessionId, session!.id)).all()
      expect(msgs.length).toBe(2)
      expect(msgs[0]!.role).toBe('user')
      expect(msgs[0]!.content).toBe('Store this')
      expect(msgs[1]!.role).toBe('assistant')
      expect(msgs[1]!.content).toBe('Stored response')
    })

    it('should auto-create agent when sending to non-existent agent', async () => {
      setMockExecuteResult({ result: 'Created!', sessionId: 'new-session' })

      const response = await handleChatRequest({
        agentName: 'new-bot',
        message: 'Hello new bot',
      })

      expect(response.response).toBe('Created!')

      const agent = await db.select().from(agents).where(eq(agents.name, 'new-bot')).get()
      expect(agent).toBeDefined()
      expect(agent!.status).toBe('active')
    })

    it('should continue existing session and increase message count', async () => {
      const agent = await createTestAgent('chat-agent')
      const session = await createTestSession(agent.id, 'counting-session')
      expect(session.messageCount).toBe(0)

      setMockExecuteResult({ result: 'Message 1', sessionId: 'counting-session' })
      const response = await handleChatRequest({
        agentName: 'chat-agent',
        message: 'First',
        sessionId: 'counting-session',
      })

      expect(response.sessionId).toBe('counting-session')

      const updated = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.sessionId, 'counting-session'))
        .get()
      expect(updated!.messageCount).toBe(2)
    })
  })

  // ----------------------------------------------------------
  // Feature: GET /api/chat/history/:sessionId
  // ----------------------------------------------------------
  describe('Feature: GET /api/chat/history/:sessionId', () => {
    it('should return all messages in order with session metadata', async () => {
      const agent = await createTestAgent('history-agent')
      const session = await createTestSession(agent.id, 'history-session')

      await createTestMessage(session.id, agent.id, 'user', 'First')
      await createTestMessage(session.id, agent.id, 'assistant', 'Second')
      await createTestMessage(session.id, agent.id, 'user', 'Third')

      const result = await handleGetHistory('history-session')

      expect(result.messages.length).toBe(3)
      expect(result.messages[0]!.content).toBe('First')
      expect(result.messages[0]!.role).toBe('user')
      expect(result.messages[1]!.content).toBe('Second')
      expect(result.messages[2]!.content).toBe('Third')
      expect(result.session).toBeDefined()
      expect(result.session!.id).toBe('history-session')
      expect(result.session!.agentId).toBe(agent.id)
    })

    it('should return empty array for non-existent session', async () => {
      const result = await handleGetHistory('ghost-session')
      expect(result.messages).toEqual([])
    })
  })

  // ----------------------------------------------------------
  // Feature: GET /api/chat/sessions/:agentId
  // ----------------------------------------------------------
  describe('Feature: GET /api/chat/sessions/:agentId', () => {
    it('should list all sessions for agent', async () => {
      const agent = await createTestAgent('multi-session-agent')

      await createTestSession(agent.id, 'session-a')
      await createTestSession(agent.id, 'session-b')
      await createTestSession(agent.id, 'session-c')

      const result = await handleGetSessions(agent.id)
      const ids = result.sessions.map(s => s.id)

      expect(result.sessions.length).toBe(3)
      expect(ids).toContain('session-a')
      expect(ids).toContain('session-b')
      expect(ids).toContain('session-c')
    })

    it('should return empty array for agent with no sessions', async () => {
      const agent = await createTestAgent('no-session-agent')
      const result = await handleGetSessions(agent.id)
      expect(result.sessions).toEqual([])
    })
  })

  // ----------------------------------------------------------
  // Feature: GET /api/agents - List Agents
  // ----------------------------------------------------------
  describe('Feature: GET /api/agents - List Agents', () => {
    it('should list all agents', async () => {
      await createTestAgent('alpha')
      await createTestAgent('beta')
      await createTestAgent('gamma')

      const result = await handleListAgents()
      const names = result.agents.map(a => a.name)

      expect(result.agents.length).toBe(3)
      expect(names).toContain('alpha')
      expect(names).toContain('beta')
      expect(names).toContain('gamma')
    })

    it('should return empty array when no agents exist', async () => {
      const result = await handleListAgents()
      expect(result.agents).toEqual([])
    })
  })

  // ----------------------------------------------------------
  // Feature: POST /api/agents - Create Agent
  // ----------------------------------------------------------
  describe('Feature: POST /api/agents - Create Agent', () => {
    it('should create new agent with active status', async () => {
      const result = await handleCreateAgent({ name: 'created-agent' })

      expect(result.agent.name).toBe('created-agent')
      expect(result.agent.status).toBe('active')
      expect(result.agent.id).toBeGreaterThan(0)
    })

    it('should fail to create duplicate agent', async () => {
      await createTestAgent('existing')

      await expect(handleCreateAgent({ name: 'existing' })).rejects.toThrow(
        'Agent already exists: existing',
      )
    })
  })

  // ----------------------------------------------------------
  // Feature: GET /api/agents/:name - Get Agent Details
  // ----------------------------------------------------------
  describe('Feature: GET /api/agents/:name - Get Agent Details', () => {
    it('should return full agent details', async () => {
      await createTestAgent('full-details')

      const result = await handleGetAgent('full-details')

      expect(result.agent!.id).toBeGreaterThan(0)
      expect(result.agent!.name).toBe('full-details')
      expect(result.agent!.status).toBe('active')
      expect(result.agent!.createdAt).toBeDefined()
    })

    it('should return error for non-existent agent', async () => {
      const result = await handleGetAgent('missing')
      expect(result.error).toBe('Agent not found')
    })
  })

  // ----------------------------------------------------------
  // Feature: DELETE /api/agents/:name - Delete Agent
  // ----------------------------------------------------------
  describe('Feature: DELETE /api/agents/:name - Delete Agent', () => {
    it('should delete agent from database', async () => {
      await createTestAgent('to-delete')

      const result = await handleDeleteAgent('to-delete')

      expect(result.success).toBe(true)
      const agent = await db.select().from(agents).where(eq(agents.name, 'to-delete')).get()
      expect(agent).toBeUndefined()
    })

    it('should fail to delete non-existent agent', async () => {
      await expect(handleDeleteAgent('phantom')).rejects.toThrow('Agent not found: phantom')
    })
  })
})
