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
    describe('Scenario: Send message to existing agent', () => {
      it('Given an agent "assistant" exists', async () => {
        await createTestAgent('assistant')
      })

      it('When sending a message to the agent', async () => {
        await createTestAgent('assistant')
        setMockExecuteResult({ result: 'Hello there!', sessionId: 'session-1' })

        const response = await handleChatRequest({
          agentName: 'assistant',
          message: 'Hello',
        })

        expect(response).toBeDefined()
      })

      it('Then a response should be returned', async () => {
        await createTestAgent('assistant')
        setMockExecuteResult({ result: 'I can help you!', sessionId: 'session-1' })

        const response = await handleChatRequest({
          agentName: 'assistant',
          message: 'Can you help?',
        })

        expect(response.response).toBe('I can help you!')
      })

      it('And a session ID should be included', async () => {
        await createTestAgent('assistant')
        setMockExecuteResult({ result: 'Response', sessionId: 'my-session-id' })

        const response = await handleChatRequest({
          agentName: 'assistant',
          message: 'Test',
        })

        expect(response.sessionId).toBe('my-session-id')
      })

      it('And messages should be stored in database', async () => {
        await createTestAgent('assistant')
        setMockExecuteResult({ result: 'Stored response', sessionId: 'stored-session' })

        await handleChatRequest({
          agentName: 'assistant',
          message: 'Store this',
        })

        const session = await db
          .select()
          .from(chatSessions)
          .where(eq(chatSessions.sessionId, 'stored-session'))
          .get()

        expect(session).toBeDefined()

        const msgs = await db
          .select()
          .from(messages)
          .where(eq(messages.sessionId, session!.id))
          .all()

        expect(msgs.length).toBe(2)
        expect(msgs[0]!.role).toBe('user')
        expect(msgs[0]!.content).toBe('Store this')
        expect(msgs[1]!.role).toBe('assistant')
        expect(msgs[1]!.content).toBe('Stored response')
      })
    })

    describe('Scenario: Send message to non-existent agent (auto-create)', () => {
      it('Given no agent "new-bot" exists', async () => {
        const agent = await db.select().from(agents).where(eq(agents.name, 'new-bot')).get()
        expect(agent).toBeUndefined()
      })

      it('When sending a message to "new-bot"', async () => {
        setMockExecuteResult({ result: 'Created!', sessionId: 'new-session' })

        const response = await handleChatRequest({
          agentName: 'new-bot',
          message: 'Hello new bot',
        })

        expect(response.response).toBe('Created!')
      })

      it('Then the agent should be auto-created', async () => {
        setMockExecuteResult({ result: 'Response', sessionId: 'session' })

        await handleChatRequest({
          agentName: 'new-bot',
          message: 'Hello',
        })

        const agent = await db.select().from(agents).where(eq(agents.name, 'new-bot')).get()
        expect(agent).toBeDefined()
        expect(agent!.status).toBe('active')
      })
    })

    describe('Scenario: Continue existing session', () => {
      it('Given an existing chat session', async () => {
        const agent = await createTestAgent('chat-agent')
        await createTestSession(agent.id, 'existing-session')
      })

      it('When sending a message with session ID', async () => {
        const agent = await createTestAgent('chat-agent')
        await createTestSession(agent.id, 'existing-session')
        setMockExecuteResult({ result: 'Continuing...', sessionId: 'existing-session' })

        const response = await handleChatRequest({
          agentName: 'chat-agent',
          message: 'Continue chat',
          sessionId: 'existing-session',
        })

        expect(response.sessionId).toBe('existing-session')
      })

      it('Then session message count should increase', async () => {
        const agent = await createTestAgent('chat-agent')
        const session = await createTestSession(agent.id, 'counting-session')

        expect(session.messageCount).toBe(0)

        setMockExecuteResult({ result: 'Message 1', sessionId: 'counting-session' })
        await handleChatRequest({
          agentName: 'chat-agent',
          message: 'First',
          sessionId: 'counting-session',
        })

        const updated = await db
          .select()
          .from(chatSessions)
          .where(eq(chatSessions.sessionId, 'counting-session'))
          .get()

        expect(updated!.messageCount).toBe(2) // user + assistant
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: GET /api/chat/history/:sessionId
  // ----------------------------------------------------------
  describe('Feature: GET /api/chat/history/:sessionId', () => {
    describe('Scenario: Get history for session with messages', () => {
      it('Given a session with chat history', async () => {
        const agent = await createTestAgent('history-agent')
        const session = await createTestSession(agent.id, 'history-session')

        await createTestMessage(session.id, agent.id, 'user', 'Hello')
        await createTestMessage(session.id, agent.id, 'assistant', 'Hi there!')
        await createTestMessage(session.id, agent.id, 'user', 'How are you?')
        await createTestMessage(session.id, agent.id, 'assistant', 'I am doing well!')
      })

      it('When getting history for the session', async () => {
        const agent = await createTestAgent('history-agent')
        const session = await createTestSession(agent.id, 'history-session')

        await createTestMessage(session.id, agent.id, 'user', 'Hello')
        await createTestMessage(session.id, agent.id, 'assistant', 'Hi!')

        const result = await handleGetHistory('history-session')
        expect(result.messages.length).toBe(2)
      })

      it('Then all messages should be returned in order', async () => {
        const agent = await createTestAgent('history-agent')
        const session = await createTestSession(agent.id, 'history-session')

        await createTestMessage(session.id, agent.id, 'user', 'First')
        await createTestMessage(session.id, agent.id, 'assistant', 'Second')
        await createTestMessage(session.id, agent.id, 'user', 'Third')

        const result = await handleGetHistory('history-session')

        expect(result.messages[0]!.content).toBe('First')
        expect(result.messages[0]!.role).toBe('user')
        expect(result.messages[1]!.content).toBe('Second')
        expect(result.messages[1]!.role).toBe('assistant')
        expect(result.messages[2]!.content).toBe('Third')
      })

      it('And session metadata should be included', async () => {
        const agent = await createTestAgent('history-agent')
        const session = await createTestSession(agent.id, 'meta-session')

        await createTestMessage(session.id, agent.id, 'user', 'Test')

        const result = await handleGetHistory('meta-session')

        expect(result.session).toBeDefined()
        expect(result.session!.id).toBe('meta-session')
        expect(result.session!.agentId).toBe(agent.id)
      })
    })

    describe('Scenario: Get history for non-existent session', () => {
      it('Given no session with ID "ghost-session" exists', async () => {
        const session = await db
          .select()
          .from(chatSessions)
          .where(eq(chatSessions.sessionId, 'ghost-session'))
          .get()
        expect(session).toBeUndefined()
      })

      it('When getting history for "ghost-session"', async () => {
        const result = await handleGetHistory('ghost-session')
        expect(result.messages).toEqual([])
      })

      it('Then empty messages array should be returned', async () => {
        const result = await handleGetHistory('nonexistent')
        expect(result.messages.length).toBe(0)
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: GET /api/chat/sessions/:agentId
  // ----------------------------------------------------------
  describe('Feature: GET /api/chat/sessions/:agentId', () => {
    describe('Scenario: List sessions for agent with sessions', () => {
      it('Given an agent has multiple chat sessions', async () => {
        const agent = await createTestAgent('multi-session-agent')

        await createTestSession(agent.id, 'session-1')
        await createTestSession(agent.id, 'session-2')
        await createTestSession(agent.id, 'session-3')
      })

      it('When listing sessions for the agent', async () => {
        const agent = await createTestAgent('multi-session-agent')

        await createTestSession(agent.id, 'session-1')
        await createTestSession(agent.id, 'session-2')

        const result = await handleGetSessions(agent.id)
        expect(result.sessions.length).toBe(2)
      })

      it('Then all sessions should be returned', async () => {
        const agent = await createTestAgent('multi-session-agent')

        await createTestSession(agent.id, 'session-a')
        await createTestSession(agent.id, 'session-b')
        await createTestSession(agent.id, 'session-c')

        const result = await handleGetSessions(agent.id)
        const ids = result.sessions.map(s => s.id)

        expect(ids).toContain('session-a')
        expect(ids).toContain('session-b')
        expect(ids).toContain('session-c')
      })
    })

    describe('Scenario: List sessions for agent with no sessions', () => {
      it('Given an agent has no sessions', async () => {
        await createTestAgent('no-session-agent')
      })

      it('When listing sessions', async () => {
        const agent = await createTestAgent('no-session-agent')
        const result = await handleGetSessions(agent.id)
        expect(result.sessions).toEqual([])
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: GET /api/agents - List Agents
  // ----------------------------------------------------------
  describe('Feature: GET /api/agents - List Agents', () => {
    describe('Scenario: List agents when multiple exist', () => {
      it('Given multiple agents exist', async () => {
        await createTestAgent('agent-1')
        await createTestAgent('agent-2')
        await createTestAgent('agent-3')
      })

      it('When listing all agents', async () => {
        await createTestAgent('agent-1')
        await createTestAgent('agent-2')

        const result = await handleListAgents()
        expect(result.agents.length).toBe(2)
      })

      it('Then all agents should be returned', async () => {
        await createTestAgent('alpha')
        await createTestAgent('beta')
        await createTestAgent('gamma')

        const result = await handleListAgents()
        const names = result.agents.map(a => a.name)

        expect(names).toContain('alpha')
        expect(names).toContain('beta')
        expect(names).toContain('gamma')
      })
    })

    describe('Scenario: List agents when none exist', () => {
      it('Given no agents exist', async () => {
        const result = await handleListAgents()
        expect(result.agents).toEqual([])
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: POST /api/agents - Create Agent
  // ----------------------------------------------------------
  describe('Feature: POST /api/agents - Create Agent', () => {
    describe('Scenario: Create new agent', () => {
      it('Given no agent "new-agent" exists', async () => {
        const agent = await db.select().from(agents).where(eq(agents.name, 'new-agent')).get()
        expect(agent).toBeUndefined()
      })

      it('When creating agent "new-agent"', async () => {
        const result = await handleCreateAgent({ name: 'new-agent' })
        expect(result.agent).toBeDefined()
      })

      it('Then agent should be created with active status', async () => {
        const result = await handleCreateAgent({ name: 'created-agent' })

        expect(result.agent.name).toBe('created-agent')
        expect(result.agent.status).toBe('active')
        expect(result.agent.id).toBeGreaterThan(0)
      })
    })

    describe('Scenario: Fail to create duplicate agent', () => {
      it('Given agent "existing" already exists', async () => {
        await createTestAgent('existing')
      })

      it('When trying to create another "existing" agent', async () => {
        await createTestAgent('existing')

        await expect(handleCreateAgent({ name: 'existing' })).rejects.toThrow(
          'Agent already exists: existing',
        )
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: GET /api/agents/:name - Get Agent Details
  // ----------------------------------------------------------
  describe('Feature: GET /api/agents/:name - Get Agent Details', () => {
    describe('Scenario: Get existing agent', () => {
      it('Given agent "details-bot" exists', async () => {
        await createTestAgent('details-bot')
      })

      it('When getting agent details', async () => {
        await createTestAgent('details-bot')
        const result = await handleGetAgent('details-bot')

        expect(result.agent).toBeDefined()
        expect(result.agent!.name).toBe('details-bot')
      })

      it('Then full agent details should be returned', async () => {
        await createTestAgent('full-details')
        const result = await handleGetAgent('full-details')

        expect(result.agent!.id).toBeGreaterThan(0)
        expect(result.agent!.name).toBe('full-details')
        expect(result.agent!.status).toBe('active')
        expect(result.agent!.createdAt).toBeDefined()
      })
    })

    describe('Scenario: Get non-existent agent', () => {
      it('Given no agent "missing" exists', async () => {
        const agent = await db.select().from(agents).where(eq(agents.name, 'missing')).get()
        expect(agent).toBeUndefined()
      })

      it('When getting "missing" agent', async () => {
        const result = await handleGetAgent('missing')
        expect(result.error).toBe('Agent not found')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: DELETE /api/agents/:name - Delete Agent
  // ----------------------------------------------------------
  describe('Feature: DELETE /api/agents/:name - Delete Agent', () => {
    describe('Scenario: Delete existing agent', () => {
      it('Given agent "deletable" exists', async () => {
        await createTestAgent('deletable')
      })

      it('When deleting the agent', async () => {
        await createTestAgent('deletable')
        const result = await handleDeleteAgent('deletable')

        expect(result.success).toBe(true)
      })

      it('Then agent should be removed from database', async () => {
        await createTestAgent('to-delete')
        await handleDeleteAgent('to-delete')

        const agent = await db.select().from(agents).where(eq(agents.name, 'to-delete')).get()
        expect(agent).toBeUndefined()
      })
    })

    describe('Scenario: Fail to delete non-existent agent', () => {
      it('Given no agent "phantom" exists', async () => {
        const agent = await db.select().from(agents).where(eq(agents.name, 'phantom')).get()
        expect(agent).toBeUndefined()
      })

      it('When trying to delete "phantom"', async () => {
        await expect(handleDeleteAgent('phantom')).rejects.toThrow('Agent not found: phantom')
      })
    })
  })
})
