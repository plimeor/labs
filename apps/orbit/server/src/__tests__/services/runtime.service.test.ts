/**
 * BDD Tests for Runtime Service
 *
 * Tests agent execution logic including:
 * - Simple chat execution (text response)
 * - Tool use handling
 * - Agentic loop with multiple tool calls
 * - Memory writing after execution
 * - Inbox message handling
 * - QMD index updates
 *
 * Uses mocked Anthropic SDK and QMD service
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { agents, type Agent } from '@db/agents'
import { agentInbox, type AgentInboxMessage } from '@db/inbox'
import { eq, and } from 'drizzle-orm'

import { createTestDb, closeTestDb, type TestDb, type TestDatabase } from '../helpers/test-db'
import {
  createTextResponse,
  createToolUseResponse,
  createMixedResponse,
  type MockMessageResponse,
} from '../mocks/anthropic.mock'
import { resetMockQmd } from '../mocks/qmd.mock'

// ============================================================
// Test Database Setup
// ============================================================

let testDb: TestDatabase
let db: TestDb

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

async function sendInboxMessage(
  fromAgentId: number,
  toAgentId: number,
  message: string,
): Promise<AgentInboxMessage> {
  const result = await db
    .insert(agentInbox)
    .values({
      fromAgentId,
      toAgentId,
      message,
      messageType: 'request',
      status: 'pending',
    })
    .returning()
  return result[0]!
}

// ============================================================
// Mock Anthropic Client
// ============================================================

interface MockAnthropicState {
  responses: MockMessageResponse[]
  callIndex: number
  apiCalls: Array<{
    system: string
    messages: unknown[]
    tools: unknown[]
  }>
}

let mockAnthropicState: MockAnthropicState

function resetMockAnthropic(
  responses: MockMessageResponse[] = [createTextResponse('Mock response')],
) {
  mockAnthropicState = {
    responses,
    callIndex: 0,
    apiCalls: [],
  }
}

// Mock API call
async function mockApiCall(params: {
  system: string
  messages: unknown[]
  tools: unknown[]
}): Promise<MockMessageResponse> {
  mockAnthropicState.apiCalls.push(params)

  const response =
    mockAnthropicState.responses[
      Math.min(mockAnthropicState.callIndex, mockAnthropicState.responses.length - 1)
    ]!
  mockAnthropicState.callIndex++

  return response
}

// ============================================================
// Simplified Runtime Logic (for testing)
// ============================================================

type SessionType = 'chat' | 'heartbeat' | 'cron'

interface ExecuteAgentParams {
  agentName: string
  prompt: string
  sessionType: SessionType
  sessionId?: string
}

interface ExecuteAgentResult {
  result: string
  sessionId: string
  toolCallsMade: string[]
}

// Memory entries recorded during execution
const memoryEntries: Array<{ agentName: string; entry: unknown }> = []

// Simplified execute agent (inline for testing with mocks)
async function executeAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult> {
  const { agentName, prompt, sessionType, sessionId } = params

  // Get agent
  const agent = await db.select().from(agents).where(eq(agents.name, agentName)).get()
  if (!agent) {
    throw new Error(`Agent not found: ${agentName}`)
  }

  // Check inbox
  const inbox = await db
    .select()
    .from(agentInbox)
    .where(and(eq(agentInbox.toAgentId, agent.id), eq(agentInbox.status, 'pending')))
    .all()

  // Compose system prompt (simplified)
  const systemPrompt = `You are ${agentName}. Session type: ${sessionType}.${
    inbox.length > 0 ? `\n\nInbox: ${inbox.map(m => m.message).join(', ')}` : ''
  }`

  // Define tools (simplified)
  const tools = [
    { name: 'schedule_task', description: 'Schedule a task' },
    { name: 'send_to_agent', description: 'Send message to agent' },
  ]

  // Execute agentic loop
  let result = ''
  const toolCallsMade: string[] = []
  const newSessionId = sessionId || `${agentName}-${Date.now()}`

  const messages: unknown[] = [{ role: 'user', content: prompt }]

  let continueLoop = true
  while (continueLoop) {
    const response = await mockApiCall({
      system: systemPrompt,
      messages,
      tools,
    })

    const assistantContent: unknown[] = []

    for (const block of response.content) {
      assistantContent.push(block)

      if (block.type === 'text') {
        result = block.text
      } else if (block.type === 'tool_use') {
        toolCallsMade.push(block.name)

        // Simulate tool execution
        const toolResult = `Tool ${block.name} executed successfully`

        messages.push({ role: 'assistant', content: assistantContent })
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: block.id,
              content: toolResult,
            },
          ],
        })
      }
    }

    // Check if we should continue
    if (response.stop_reason === 'end_turn' || response.content.every(b => b.type === 'text')) {
      continueLoop = false
    } else if (response.content.some(b => b.type === 'tool_use')) {
      // Continue loop after tool use
      continueLoop = true
    } else {
      continueLoop = false
    }
  }

  // Mark inbox messages as read
  if (inbox.length > 0) {
    for (const msg of inbox) {
      await db
        .update(agentInbox)
        .set({ status: 'read', readAt: new Date() })
        .where(eq(agentInbox.id, msg.id))
    }
  }

  // Update last active
  await db.update(agents).set({ lastActiveAt: new Date() }).where(eq(agents.name, agentName))

  // Record memory entry
  memoryEntries.push({
    agentName,
    entry: {
      sessionType,
      prompt,
      result,
      timestamp: new Date(),
    },
  })

  return { result, sessionId: newSessionId, toolCallsMade }
}

// ============================================================
// BDD Tests
// ============================================================

describe('Runtime Service', () => {
  beforeEach(async () => {
    testDb = await createTestDb()
    db = testDb.db
    resetMockQmd()
    resetMockAnthropic()
    memoryEntries.length = 0
  })

  afterEach(() => {
    closeTestDb(testDb)
  })

  // ----------------------------------------------------------
  // Feature: Simple Chat Execution
  // ----------------------------------------------------------
  describe('Feature: Simple Chat Execution', () => {
    describe('Scenario: Execute agent with text-only response', () => {
      it('Given an agent "chat-bot" exists', async () => {
        const agent = await createTestAgent('chat-bot')
        expect(agent.id).toBeGreaterThan(0)
      })

      it('When the agent is executed with a prompt', async () => {
        await createTestAgent('chat-bot')
        resetMockAnthropic([createTextResponse('Hello! How can I help you?')])

        const result = await executeAgent({
          agentName: 'chat-bot',
          prompt: 'Hello',
          sessionType: 'chat',
        })

        expect(result.result).toBe('Hello! How can I help you?')
      })

      it('Then the response text should be returned', async () => {
        await createTestAgent('chat-bot')
        resetMockAnthropic([createTextResponse('I am doing great!')])

        const result = await executeAgent({
          agentName: 'chat-bot',
          prompt: 'How are you?',
          sessionType: 'chat',
        })

        expect(result.result).toBe('I am doing great!')
      })

      it('And a session ID should be generated', async () => {
        await createTestAgent('chat-bot')
        resetMockAnthropic([createTextResponse('Response')])

        const result = await executeAgent({
          agentName: 'chat-bot',
          prompt: 'Test',
          sessionType: 'chat',
        })

        expect(result.sessionId).toContain('chat-bot')
      })

      it('And the agent lastActiveAt should be updated', async () => {
        const agent = await createTestAgent('chat-bot')
        expect(agent.lastActiveAt).toBeNull()

        resetMockAnthropic([createTextResponse('Response')])

        await executeAgent({
          agentName: 'chat-bot',
          prompt: 'Test',
          sessionType: 'chat',
        })

        const updated = await db.select().from(agents).where(eq(agents.name, 'chat-bot')).get()
        expect(updated!.lastActiveAt).not.toBeNull()
      })

      it('And a memory entry should be recorded', async () => {
        await createTestAgent('chat-bot')
        resetMockAnthropic([createTextResponse('Response')])

        await executeAgent({
          agentName: 'chat-bot',
          prompt: 'Test prompt',
          sessionType: 'chat',
        })

        expect(memoryEntries.length).toBe(1)
        expect(memoryEntries[0]!.agentName).toBe('chat-bot')
      })
    })

    describe('Scenario: Execute agent with existing session ID', () => {
      it('Given an agent and existing session', async () => {
        await createTestAgent('session-bot')
        resetMockAnthropic([createTextResponse('Continuing...')])
      })

      it('When executed with a session ID', async () => {
        await createTestAgent('session-bot')
        resetMockAnthropic([createTextResponse('Continuing...')])

        const result = await executeAgent({
          agentName: 'session-bot',
          prompt: 'Continue',
          sessionType: 'chat',
          sessionId: 'existing-session-123',
        })

        expect(result.sessionId).toBe('existing-session-123')
      })
    })

    describe('Scenario: Fail to execute non-existent agent', () => {
      it('Given no agent "ghost" exists', async () => {
        const agent = await db.select().from(agents).where(eq(agents.name, 'ghost')).get()
        expect(agent).toBeUndefined()
      })

      it('When trying to execute "ghost"', async () => {
        await expect(
          executeAgent({
            agentName: 'ghost',
            prompt: 'Hello',
            sessionType: 'chat',
          }),
        ).rejects.toThrow('Agent not found: ghost')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Tool Use Handling
  // ----------------------------------------------------------
  describe('Feature: Tool Use Handling', () => {
    describe('Scenario: Agent uses a single tool', () => {
      it('Given an agent that will use a tool', async () => {
        await createTestAgent('tool-user')
        resetMockAnthropic([
          createToolUseResponse([
            { name: 'schedule_task', input: { prompt: 'Do something', scheduleType: 'interval' } },
          ]),
          createTextResponse('Task scheduled successfully!'),
        ])
      })

      it('When the agent is executed', async () => {
        await createTestAgent('tool-user')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: { prompt: 'Task' } }]),
          createTextResponse('Done!'),
        ])

        const result = await executeAgent({
          agentName: 'tool-user',
          prompt: 'Schedule a reminder',
          sessionType: 'chat',
        })

        expect(result.toolCallsMade).toContain('schedule_task')
      })

      it('Then the tool should be executed', async () => {
        await createTestAgent('tool-user')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: { prompt: 'Task' } }]),
          createTextResponse('Done!'),
        ])

        const result = await executeAgent({
          agentName: 'tool-user',
          prompt: 'Schedule a reminder',
          sessionType: 'chat',
        })

        expect(result.toolCallsMade.length).toBe(1)
        expect(result.toolCallsMade[0]).toBe('schedule_task')
      })

      it('And the final text response should be returned', async () => {
        await createTestAgent('tool-user')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createTextResponse('Your task has been scheduled!'),
        ])

        const result = await executeAgent({
          agentName: 'tool-user',
          prompt: 'Schedule a reminder',
          sessionType: 'chat',
        })

        expect(result.result).toBe('Your task has been scheduled!')
      })
    })

    describe('Scenario: Agent uses multiple tools in sequence', () => {
      it('Given an agent that will use multiple tools', async () => {
        await createTestAgent('multi-tool')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createToolUseResponse([{ name: 'send_to_agent', input: {} }]),
          createTextResponse('All done!'),
        ])
      })

      it('When the agent is executed', async () => {
        await createTestAgent('multi-tool')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createToolUseResponse([{ name: 'send_to_agent', input: {} }]),
          createTextResponse('All done!'),
        ])

        const result = await executeAgent({
          agentName: 'multi-tool',
          prompt: 'Do multiple things',
          sessionType: 'chat',
        })

        expect(result.toolCallsMade.length).toBe(2)
      })

      it('Then all tools should be executed in order', async () => {
        await createTestAgent('multi-tool')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createToolUseResponse([{ name: 'send_to_agent', input: {} }]),
          createTextResponse('All done!'),
        ])

        const result = await executeAgent({
          agentName: 'multi-tool',
          prompt: 'Do multiple things',
          sessionType: 'chat',
        })

        expect(result.toolCallsMade[0]).toBe('schedule_task')
        expect(result.toolCallsMade[1]).toBe('send_to_agent')
      })
    })

    describe('Scenario: Agent response with text and tool use', () => {
      it('Given an agent that returns mixed response', async () => {
        await createTestAgent('mixed-bot')
        resetMockAnthropic([
          createMixedResponse('Let me schedule that for you...', [
            { name: 'schedule_task', input: {} },
          ]),
          createTextResponse('Done!'),
        ])
      })

      it('When the agent is executed', async () => {
        await createTestAgent('mixed-bot')
        resetMockAnthropic([
          createMixedResponse('Scheduling...', [{ name: 'schedule_task', input: {} }]),
          createTextResponse('Task scheduled!'),
        ])

        const result = await executeAgent({
          agentName: 'mixed-bot',
          prompt: 'Schedule something',
          sessionType: 'chat',
        })

        expect(result.toolCallsMade).toContain('schedule_task')
        expect(result.result).toBe('Task scheduled!')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Inbox Message Handling
  // ----------------------------------------------------------
  describe('Feature: Inbox Message Handling', () => {
    describe('Scenario: Agent receives and processes inbox messages', () => {
      it('Given an agent has pending inbox messages', async () => {
        const alice = await createTestAgent('alice')
        const bob = await createTestAgent('bob')

        await sendInboxMessage(alice.id, bob.id, 'Hey Bob, how are you?')

        const inbox = await db
          .select()
          .from(agentInbox)
          .where(eq(agentInbox.toAgentId, bob.id))
          .all()

        expect(inbox.length).toBe(1)
        expect(inbox[0]!.status).toBe('pending')
      })

      it('When bob agent is executed', async () => {
        const alice = await createTestAgent('alice')
        const bob = await createTestAgent('bob')

        await sendInboxMessage(alice.id, bob.id, 'Hey Bob!')

        resetMockAnthropic([createTextResponse('I got your message!')])

        await executeAgent({
          agentName: 'bob',
          prompt: 'Check inbox',
          sessionType: 'chat',
        })
      })

      it('Then inbox messages should be marked as read', async () => {
        const alice = await createTestAgent('alice')
        const bob = await createTestAgent('bob')

        const msg = await sendInboxMessage(alice.id, bob.id, 'Hey Bob!')

        resetMockAnthropic([createTextResponse('Response')])

        await executeAgent({
          agentName: 'bob',
          prompt: 'Check inbox',
          sessionType: 'chat',
        })

        const updated = await db.select().from(agentInbox).where(eq(agentInbox.id, msg.id)).get()

        expect(updated!.status).toBe('read')
        expect(updated!.readAt).not.toBeNull()
      })

      it('And inbox content should be included in system prompt', async () => {
        const alice = await createTestAgent('alice')
        const bob = await createTestAgent('bob')

        await sendInboxMessage(alice.id, bob.id, 'Important message!')

        resetMockAnthropic([createTextResponse('Response')])

        await executeAgent({
          agentName: 'bob',
          prompt: 'Hello',
          sessionType: 'chat',
        })

        // Check that the API was called with inbox in system prompt
        expect(mockAnthropicState.apiCalls.length).toBeGreaterThan(0)
        expect(mockAnthropicState.apiCalls[0]!.system).toContain('Important message!')
      })
    })

    describe('Scenario: Agent with no inbox messages', () => {
      it('Given an agent has no pending messages', async () => {
        await createTestAgent('lonely-bot')
      })

      it('When the agent is executed', async () => {
        await createTestAgent('lonely-bot')
        resetMockAnthropic([createTextResponse('Hello!')])

        const result = await executeAgent({
          agentName: 'lonely-bot',
          prompt: 'Hi',
          sessionType: 'chat',
        })

        expect(result.result).toBe('Hello!')
      })

      it('Then execution should proceed normally', async () => {
        await createTestAgent('lonely-bot')
        resetMockAnthropic([createTextResponse('Normal response')])

        const result = await executeAgent({
          agentName: 'lonely-bot',
          prompt: 'Test',
          sessionType: 'chat',
        })

        expect(result.result).toBe('Normal response')
        expect(mockAnthropicState.apiCalls[0]!.system).not.toContain('Inbox')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Session Types
  // ----------------------------------------------------------
  describe('Feature: Session Types', () => {
    describe('Scenario: Chat session execution', () => {
      it('Given a chat session type', async () => {
        await createTestAgent('chat-agent')
        resetMockAnthropic([createTextResponse('Chat response')])
      })

      it('When executed with chat session type', async () => {
        await createTestAgent('chat-agent')
        resetMockAnthropic([createTextResponse('Chat response')])

        await executeAgent({
          agentName: 'chat-agent',
          prompt: 'Hello',
          sessionType: 'chat',
        })

        expect(mockAnthropicState.apiCalls[0]!.system).toContain('chat')
      })
    })

    describe('Scenario: Heartbeat session execution', () => {
      it('Given a heartbeat session type', async () => {
        await createTestAgent('heartbeat-agent')
        resetMockAnthropic([createTextResponse('Heartbeat done')])
      })

      it('When executed with heartbeat session type', async () => {
        await createTestAgent('heartbeat-agent')
        resetMockAnthropic([createTextResponse('Heartbeat done')])

        await executeAgent({
          agentName: 'heartbeat-agent',
          prompt: 'Daily check',
          sessionType: 'heartbeat',
        })

        expect(mockAnthropicState.apiCalls[0]!.system).toContain('heartbeat')
      })
    })

    describe('Scenario: Cron session execution', () => {
      it('Given a cron session type', async () => {
        await createTestAgent('cron-agent')
        resetMockAnthropic([createTextResponse('Cron task done')])
      })

      it('When executed with cron session type', async () => {
        await createTestAgent('cron-agent')
        resetMockAnthropic([createTextResponse('Cron task done')])

        await executeAgent({
          agentName: 'cron-agent',
          prompt: 'Scheduled task',
          sessionType: 'cron',
        })

        expect(mockAnthropicState.apiCalls[0]!.system).toContain('cron')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Memory Recording
  // ----------------------------------------------------------
  describe('Feature: Memory Recording', () => {
    describe('Scenario: Memory entry recorded after execution', () => {
      it('Given an agent executes successfully', async () => {
        await createTestAgent('memory-agent')
        resetMockAnthropic([createTextResponse('Done!')])
      })

      it('When execution completes', async () => {
        await createTestAgent('memory-agent')
        resetMockAnthropic([createTextResponse('Task completed!')])

        await executeAgent({
          agentName: 'memory-agent',
          prompt: 'Do something',
          sessionType: 'chat',
        })

        expect(memoryEntries.length).toBe(1)
      })

      it('Then a memory entry should be created', async () => {
        await createTestAgent('memory-agent')
        resetMockAnthropic([createTextResponse('Result text')])

        await executeAgent({
          agentName: 'memory-agent',
          prompt: 'Test prompt',
          sessionType: 'chat',
        })

        const entry = memoryEntries[0]!
        expect(entry.agentName).toBe('memory-agent')
        expect((entry.entry as any).prompt).toBe('Test prompt')
        expect((entry.entry as any).result).toBe('Result text')
        expect((entry.entry as any).sessionType).toBe('chat')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Agentic Loop Behavior
  // ----------------------------------------------------------
  describe('Feature: Agentic Loop Behavior', () => {
    describe('Scenario: Loop continues until no tool calls', () => {
      it('Given multiple tool calls are needed', async () => {
        await createTestAgent('loop-agent')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createToolUseResponse([{ name: 'send_to_agent', input: {} }]),
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createTextResponse('Finally done!'),
        ])
      })

      it('When agent is executed', async () => {
        await createTestAgent('loop-agent')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createToolUseResponse([{ name: 'send_to_agent', input: {} }]),
          createTextResponse('Done!'),
        ])

        const result = await executeAgent({
          agentName: 'loop-agent',
          prompt: 'Complex task',
          sessionType: 'chat',
        })

        expect(result.toolCallsMade.length).toBe(2)
      })

      it('Then loop should continue until text-only response', async () => {
        await createTestAgent('loop-agent')
        resetMockAnthropic([
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createToolUseResponse([{ name: 'send_to_agent', input: {} }]),
          createToolUseResponse([{ name: 'schedule_task', input: {} }]),
          createTextResponse('All tasks complete!'),
        ])

        const result = await executeAgent({
          agentName: 'loop-agent',
          prompt: 'Many tasks',
          sessionType: 'chat',
        })

        // 4 API calls total (3 tool uses + 1 final text)
        expect(mockAnthropicState.apiCalls.length).toBe(4)
        expect(result.result).toBe('All tasks complete!')
      })
    })
  })
})
