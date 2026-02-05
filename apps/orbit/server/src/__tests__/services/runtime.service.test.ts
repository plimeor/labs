/**
 * BDD Tests for Runtime Service
 *
 * Tests agent execution logic including:
 * - Simple chat execution (text response)
 * - Tool use handling
 * - Agentic loop with multiple tool calls
 * - Memory writing after execution
 * - Inbox message handling
 *
 * Mocks only: Anthropic SDK, QMD service
 * Real: DB operations, inbox service, agent service, memory service, context service, workspace service
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { existsSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'

// ============================================================
// Mock state for Anthropic (inline to avoid import issues)
// ============================================================

interface MockMessageResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<
    { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }
  >
  model: string
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null
  stop_sequence: string | null
  usage: { input_tokens: number; output_tokens: number }
}

interface MockAnthropicState {
  responses: MockMessageResponse[]
  callIndex: number
  apiCalls: unknown[]
}

let mockAnthropicState: MockAnthropicState = {
  responses: [],
  callIndex: 0,
  apiCalls: [],
}

function createTextResponse(text: string): MockMessageResponse {
  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function createToolUseResponse(
  toolCalls: Array<{ name: string; input: unknown }>,
): MockMessageResponse {
  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: toolCalls.map((tc, i) => ({
      type: 'tool_use' as const,
      id: `toolu_${Date.now()}_${i}`,
      name: tc.name,
      input: tc.input,
    })),
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function createMixedResponse(
  text: string,
  toolCalls: Array<{ name: string; input: unknown }>,
): MockMessageResponse {
  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'text' as const, text },
      ...toolCalls.map((tc, i) => ({
        type: 'tool_use' as const,
        id: `toolu_${Date.now()}_${i}`,
        name: tc.name,
        input: tc.input,
      })),
    ],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function resetMockAnthropic(
  responses: MockMessageResponse[] = [createTextResponse('Mock response')],
): void {
  mockAnthropicState = {
    responses,
    callIndex: 0,
    apiCalls: [],
  }
}

function getMockAnthropicState(): MockAnthropicState {
  return mockAnthropicState
}

// ============================================================
// Set up mocks BEFORE any imports (only Anthropic SDK and QMD)
// ============================================================

// Mock QMD Service
mock.module('@/modules/agents/services/qmd.service', () => ({
  isQmdAvailable: () => false,
  checkQmdAvailability: async () => false,
  updateIndex: async () => {},
  search: async () => [],
  getDocument: async () => '',
  indexExists: async () => false,
  initializeIndex: async () => {},
  deleteIndex: async () => {},
  resetQmdAvailability: () => {},
}))

// Mock Anthropic SDK - create a class that matches the SDK interface
mock.module('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = {
      create: async (params: unknown): Promise<MockMessageResponse> => {
        mockAnthropicState.apiCalls.push(params)
        const response =
          mockAnthropicState.responses[
            Math.min(mockAnthropicState.callIndex, mockAnthropicState.responses.length - 1)
          ]!
        mockAnthropicState.callIndex++
        return response
      },
    }
  }
  return { default: MockAnthropic }
})

// ============================================================
// NOW import modules that depend on the mocked modules
// ============================================================

import { agents, type Agent } from '@db/agents'
import { agentInbox, type AgentInboxMessage } from '@db/inbox'
import { eq } from 'drizzle-orm'

import { db } from '@/core/db'
import { createAgent } from '@/modules/agents/services/agent.service'
import { sendToAgentByName } from '@/modules/agents/services/inbox.service'
// Import real services (after mocks are set up)
import { executeAgent } from '@/modules/agents/services/runtime.service'
import { getAgentWorkspacePath } from '@/modules/agents/services/workspace.service'

import { clearAllTables } from '../helpers/test-db'

// ============================================================
// Test Helpers
// ============================================================

/** Clean up agents directory between tests */
function cleanupAgentsDir(): void {
  const agentsDir = join(process.env.ORBIT_CONFIG_PATH!, 'agents')
  if (existsSync(agentsDir)) {
    rmSync(agentsDir, { recursive: true })
  }
  mkdirSync(agentsDir, { recursive: true })
}

async function createTestAgent(name: string): Promise<Agent> {
  // Use real createAgent which creates workspace via real workspace service
  return createAgent({ name })
}

async function sendInboxMessage(
  fromAgentName: string,
  toAgentName: string,
  message: string,
): Promise<AgentInboxMessage> {
  return sendToAgentByName(fromAgentName, toAgentName, message, 'request')
}

// ============================================================
// BDD Tests
// ============================================================

describe('Runtime Service', () => {
  beforeEach(async () => {
    await clearAllTables()
    cleanupAgentsDir()
    resetMockAnthropic()
  })

  // ----------------------------------------------------------
  // Feature: Simple Chat Execution
  // ----------------------------------------------------------
  describe('Feature: Simple Chat Execution', () => {
    it('should execute agent and return response with session ID and updated lastActiveAt', async () => {
      const agent = await createTestAgent('chat-bot')
      expect(agent.lastActiveAt).toBeNull()
      resetMockAnthropic([createTextResponse('Hello! How can I help you?')])

      const result = await executeAgent({
        agentName: 'chat-bot',
        prompt: 'Hello',
        sessionType: 'chat',
      })

      expect(result.result).toBe('Hello! How can I help you?')
      expect(result.sessionId).toContain('chat-bot')

      const updated = await db.select().from(agents).where(eq(agents.name, 'chat-bot')).get()
      expect(updated!.lastActiveAt).not.toBeNull()

      const workspacePath = getAgentWorkspacePath('chat-bot')
      const memoryDir = join(workspacePath, 'memory')
      expect(existsSync(memoryDir)).toBe(true)
    })

    it('should use provided session ID', async () => {
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

    it('should fail to execute non-existent agent', async () => {
      await expect(
        executeAgent({
          agentName: 'ghost',
          prompt: 'Hello',
          sessionType: 'chat',
        }),
      ).rejects.toThrow('Agent not found: ghost')
    })
  })

  // ----------------------------------------------------------
  // Feature: Tool Use Handling
  // ----------------------------------------------------------
  describe('Feature: Tool Use Handling', () => {
    it('should execute single tool and return final response', async () => {
      await createTestAgent('tool-user')
      resetMockAnthropic([
        createToolUseResponse([
          {
            name: 'schedule_task',
            input: { prompt: 'Task', scheduleType: 'interval', scheduleValue: '3600000' },
          },
        ]),
        createTextResponse('Your task has been scheduled!'),
      ])

      const result = await executeAgent({
        agentName: 'tool-user',
        prompt: 'Schedule a reminder',
        sessionType: 'chat',
      })

      expect(result.result).toBe('Your task has been scheduled!')
    })

    it('should execute multiple tools in sequence', async () => {
      await createTestAgent('multi-tool')
      await createTestAgent('target-agent')
      resetMockAnthropic([
        createToolUseResponse([
          {
            name: 'schedule_task',
            input: { prompt: 'Task', scheduleType: 'interval', scheduleValue: '3600000' },
          },
        ]),
        createToolUseResponse([
          { name: 'send_to_agent', input: { targetAgent: 'target-agent', message: 'Hello!' } },
        ]),
        createTextResponse('All done!'),
      ])

      const result = await executeAgent({
        agentName: 'multi-tool',
        prompt: 'Do multiple things',
        sessionType: 'chat',
      })

      expect(result.result).toBe('All done!')
      const state = getMockAnthropicState()
      expect(state.apiCalls.length).toBe(3)
    })

    it('should handle mixed response with text and tool use', async () => {
      await createTestAgent('mixed-bot')
      resetMockAnthropic([
        createMixedResponse('Scheduling...', [
          {
            name: 'schedule_task',
            input: { prompt: 'Task', scheduleType: 'interval', scheduleValue: '3600000' },
          },
        ]),
        createTextResponse('Task scheduled!'),
      ])

      const result = await executeAgent({
        agentName: 'mixed-bot',
        prompt: 'Schedule something',
        sessionType: 'chat',
      })

      expect(result.result).toBe('Task scheduled!')
    })
  })

  // ----------------------------------------------------------
  // Feature: Inbox Message Handling
  // ----------------------------------------------------------
  describe('Feature: Inbox Message Handling', () => {
    it('should mark inbox messages as read and include in system prompt', async () => {
      await createTestAgent('alice')
      await createTestAgent('bob')
      const msg = await sendInboxMessage('alice', 'bob', 'Important message!')
      resetMockAnthropic([createTextResponse('Response')])

      await executeAgent({
        agentName: 'bob',
        prompt: 'Hello',
        sessionType: 'chat',
      })

      const updated = await db.select().from(agentInbox).where(eq(agentInbox.id, msg.id)).get()
      expect(updated!.status).toBe('read')
      expect(updated!.readAt).not.toBeNull()

      const state = getMockAnthropicState()
      expect((state.apiCalls[0] as any).system).toContain('Important message!')
    })

    it('should execute normally when no inbox messages', async () => {
      await createTestAgent('lonely-bot')
      resetMockAnthropic([createTextResponse('Normal response')])

      const result = await executeAgent({
        agentName: 'lonely-bot',
        prompt: 'Test',
        sessionType: 'chat',
      })

      expect(result.result).toBe('Normal response')
      const state = getMockAnthropicState()
      expect((state.apiCalls[0] as any).system).not.toContain('Inbox')
    })
  })

  // ----------------------------------------------------------
  // Feature: Session Types
  // ----------------------------------------------------------
  describe('Feature: Session Types', () => {
    it('should include chat in system prompt for chat session', async () => {
      await createTestAgent('chat-agent')
      resetMockAnthropic([createTextResponse('Chat response')])

      await executeAgent({
        agentName: 'chat-agent',
        prompt: 'Hello',
        sessionType: 'chat',
      })

      const state = getMockAnthropicState()
      expect((state.apiCalls[0] as any).system).toContain('chat')
    })

    it('should include heartbeat in system prompt for heartbeat session', async () => {
      await createTestAgent('heartbeat-agent')
      resetMockAnthropic([createTextResponse('Heartbeat done')])

      await executeAgent({
        agentName: 'heartbeat-agent',
        prompt: 'Daily check',
        sessionType: 'heartbeat',
      })

      const state = getMockAnthropicState()
      expect((state.apiCalls[0] as any).system).toContain('heartbeat')
    })

    it('should include cron in system prompt for cron session', async () => {
      await createTestAgent('cron-agent')
      resetMockAnthropic([createTextResponse('Cron task done')])

      await executeAgent({
        agentName: 'cron-agent',
        prompt: 'Scheduled task',
        sessionType: 'cron',
      })

      const state = getMockAnthropicState()
      expect((state.apiCalls[0] as any).system).toContain('cron')
    })
  })

  // ----------------------------------------------------------
  // Feature: Agentic Loop Behavior
  // ----------------------------------------------------------
  describe('Feature: Agentic Loop Behavior', () => {
    it('should continue loop until text-only response', async () => {
      await createTestAgent('loop-agent')
      await createTestAgent('target-agent')
      resetMockAnthropic([
        createToolUseResponse([
          {
            name: 'schedule_task',
            input: { prompt: 'Task 1', scheduleType: 'interval', scheduleValue: '3600000' },
          },
        ]),
        createToolUseResponse([
          { name: 'send_to_agent', input: { targetAgent: 'target-agent', message: 'Hi!' } },
        ]),
        createToolUseResponse([
          {
            name: 'schedule_task',
            input: { prompt: 'Task 2', scheduleType: 'interval', scheduleValue: '7200000' },
          },
        ]),
        createTextResponse('All tasks complete!'),
      ])

      const result = await executeAgent({
        agentName: 'loop-agent',
        prompt: 'Many tasks',
        sessionType: 'chat',
      })

      const state = getMockAnthropicState()
      expect(state.apiCalls.length).toBe(4)
      expect(result.result).toBe('All tasks complete!')
    })
  })
})
