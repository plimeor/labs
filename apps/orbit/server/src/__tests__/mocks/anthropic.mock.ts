/**
 * Mock for Anthropic SDK
 *
 * Provides a controllable mock of the Anthropic client for testing
 * agent execution without making real API calls.
 */

import type Anthropic from '@anthropic-ai/sdk'

// ============================================================
// Types
// ============================================================

export interface MockMessageResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Anthropic.ContentBlock[]
  model: string
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null
  stop_sequence: string | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

export interface MockToolCall {
  name: string
  input: Record<string, unknown>
}

// ============================================================
// Mock Response Builders
// ============================================================

/**
 * Create a text-only response from the mock assistant
 */
export function createTextResponse(text: string): MockMessageResponse {
  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 }
  }
}

/**
 * Create a tool use response from the mock assistant
 */
export function createToolUseResponse(toolCalls: MockToolCall[]): MockMessageResponse {
  const content: Anthropic.ContentBlock[] = toolCalls.map((tc, i) => ({
    type: 'tool_use' as const,
    id: `toolu_${Date.now()}_${i}`,
    name: tc.name,
    input: tc.input
  }))

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 }
  }
}

/**
 * Create a mixed response with text and tool calls
 */
export function createMixedResponse(text: string, toolCalls: MockToolCall[]): MockMessageResponse {
  const content: Anthropic.ContentBlock[] = [
    { type: 'text' as const, text },
    ...toolCalls.map((tc, i) => ({
      type: 'tool_use' as const,
      id: `toolu_${Date.now()}_${i}`,
      name: tc.name,
      input: tc.input
    }))
  ]

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 }
  }
}

// ============================================================
// Global Mock State (similar to qmd.mock.ts pattern)
// ============================================================

export interface MockAnthropicState {
  /** Sequence of responses to return for each API call */
  responses: MockMessageResponse[]
  /** Current call index */
  callIndex: number
  /** Record of all API calls made */
  apiCalls: Anthropic.MessageCreateParams[]
  /** Error to throw on API call (for testing error handling) */
  error: Error | null
}

/**
 * Create fresh mock state
 */
export function createMockAnthropicState(): MockAnthropicState {
  return {
    responses: [createTextResponse('Mock response')],
    callIndex: 0,
    apiCalls: [],
    error: null
  }
}

// Global mock state (can be reset between tests)
let globalMockState = createMockAnthropicState()

/**
 * Reset the global mock state
 */
export function resetMockAnthropic(responses: MockMessageResponse[] = [createTextResponse('Mock response')]): void {
  globalMockState = {
    responses,
    callIndex: 0,
    apiCalls: [],
    error: null
  }
}

/**
 * Get current global mock state (for assertions)
 */
export function getMockAnthropicState(): MockAnthropicState {
  return globalMockState
}

/**
 * Set responses for the global mock
 */
export function setMockResponses(responses: MockMessageResponse[]): void {
  globalMockState.responses = responses
  globalMockState.callIndex = 0
}

/**
 * Set an error to be thrown on API calls
 */
export function setMockError(error: Error | null): void {
  globalMockState.error = error
}

/**
 * Mock API call using global state
 */
export async function mockAnthropicApiCall(params: Anthropic.MessageCreateParams): Promise<MockMessageResponse> {
  globalMockState.apiCalls.push(params)

  if (globalMockState.error) {
    throw globalMockState.error
  }

  const response = globalMockState.responses[Math.min(globalMockState.callIndex, globalMockState.responses.length - 1)]!
  globalMockState.callIndex++

  return response
}

// ============================================================
// Mock Anthropic Client
// ============================================================

export interface MockAnthropicOptions {
  /**
   * Sequence of responses to return for each API call.
   * If more calls are made than responses provided, the last response is repeated.
   */
  responses?: MockMessageResponse[]

  /**
   * Error to throw on API call (for testing error handling)
   */
  error?: Error

  /**
   * Callback to capture API call parameters
   */
  onApiCall?: (params: Anthropic.MessageCreateParams) => void
}

/**
 * Create a mock Anthropic client
 */
export function createMockAnthropicClient(options: MockAnthropicOptions = {}) {
  const { responses = [createTextResponse('Mock response')], error, onApiCall } = options

  let callIndex = 0
  const apiCalls: Anthropic.MessageCreateParams[] = []

  const mockClient = {
    messages: {
      create: async (params: Anthropic.MessageCreateParams): Promise<MockMessageResponse> => {
        // Record the call
        apiCalls.push(params)
        onApiCall?.(params)

        // Throw error if configured
        if (error) {
          throw error
        }

        // Return the next response (or repeat the last one)
        const response = responses[Math.min(callIndex, responses.length - 1)]!
        callIndex++

        return response
      }
    },

    // Test utilities
    _getApiCalls: () => apiCalls,
    _getCallCount: () => callIndex,
    _reset: () => {
      callIndex = 0
      apiCalls.length = 0
    }
  }

  return mockClient
}

// ============================================================
// Module Mock Helpers
// ============================================================

/**
 * Create a mock module that can replace the real Anthropic import
 */
export function createMockAnthropicModule(options: MockAnthropicOptions = {}) {
  const mockClient = createMockAnthropicClient(options)

  // This can be used with Bun's module mocking
  return class MockAnthropic {
    messages = mockClient.messages

    static _mockClient = mockClient
  }
}

// ============================================================
// Common Test Scenarios
// ============================================================

/**
 * Mock for a simple chat interaction
 */
export function createSimpleChatMock(response: string) {
  return createMockAnthropicClient({
    responses: [createTextResponse(response)]
  })
}

/**
 * Mock for an agent that uses tools
 */
export function createToolUsingAgentMock(toolCalls: MockToolCall[], finalResponse: string) {
  return createMockAnthropicClient({
    responses: [createToolUseResponse(toolCalls), createTextResponse(finalResponse)]
  })
}

/**
 * Mock for an agent that schedules a task
 */
export function createScheduleTaskMock(taskPrompt: string, finalResponse: string) {
  return createMockAnthropicClient({
    responses: [
      createToolUseResponse([
        {
          name: 'schedule_task',
          input: {
            prompt: taskPrompt,
            scheduleType: 'interval',
            scheduleValue: '3600000',
            contextMode: 'isolated'
          }
        }
      ]),
      createTextResponse(finalResponse)
    ]
  })
}

/**
 * Mock for an agent that sends a message to another agent
 */
export function createSendToAgentMock(targetAgent: string, message: string, finalResponse: string) {
  return createMockAnthropicClient({
    responses: [
      createToolUseResponse([
        {
          name: 'send_to_agent',
          input: {
            targetAgent,
            message,
            messageType: 'request'
          }
        }
      ]),
      createTextResponse(finalResponse)
    ]
  })
}

/**
 * Mock for an agent that searches memory
 */
export function createMemorySearchMock(query: string, finalResponse: string) {
  return createMockAnthropicClient({
    responses: [
      createToolUseResponse([
        {
          name: 'search_memory',
          input: { query, maxResults: 6 }
        }
      ]),
      createTextResponse(finalResponse)
    ]
  })
}

/**
 * Mock for API error scenarios
 */
export function createErrorMock(errorMessage: string) {
  return createMockAnthropicClient({
    error: new Error(errorMessage)
  })
}
