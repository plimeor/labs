import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@plimeor-labs/logger'

import { createMemoryTools } from '../tools/memory-tools'
import { createOrbitTools, type OrbitToolHandler } from '../tools/orbit-tools'
import { getAgent, getAgentById, updateAgentLastActive } from './agent.service'
import { composeSystemPrompt, type SessionType, type InboxMessage } from './context.service'
import { checkInboxByName, markInboxRead } from './inbox.service'
import { appendDailyMemory } from './memory.service'
import * as qmd from './qmd.service'
import { getAgentWorkingDir } from './workspace.service'

/** @internal Lazy-initialized for testability */
let anthropic: Anthropic | undefined

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic()
  }
  return anthropic
}

export interface ExecuteAgentParams {
  agentName: string
  prompt: string
  sessionType: SessionType
  sessionId?: string
}

export interface ExecuteAgentResult {
  result: string
  sessionId: string
}

export async function executeAgent(params: ExecuteAgentParams): Promise<ExecuteAgentResult> {
  const { agentName, prompt, sessionType, sessionId } = params
  const workingDir = getAgentWorkingDir(agentName)

  // Get agent ID
  const agent = await getAgent(agentName)
  if (!agent) {
    throw new Error(`Agent not found: ${agentName}`)
  }

  // Check inbox for messages
  const inbox = await checkInboxByName(agentName)
  const inboxMessages: InboxMessage[] = await Promise.all(
    inbox.map(async m => {
      const fromAgent = await getAgentById(m.fromAgentId)
      return {
        id: m.id,
        fromAgent: fromAgent?.name || `Agent#${m.fromAgentId}`,
        message: m.message,
      }
    }),
  )

  // Compose system prompt
  const systemPrompt = await composeSystemPrompt(agentName, sessionType, inboxMessages)

  // Create orbit tools for this agent
  const { tools: orbitTools, handleToolCall: handleOrbitToolCall } = createOrbitTools(
    agentName,
    agent.id,
  )

  // Create memory tools (returns undefined if QMD not available)
  const memoryToolsResult = createMemoryTools(agentName)

  // Combine all tools
  const tools = memoryToolsResult ? [...orbitTools, ...memoryToolsResult.tools] : orbitTools

  // Combined tool handler
  const handleToolCall = async (
    toolName: string,
    args: Record<string, unknown>,
    workingDir: string,
  ): Promise<string> => {
    // Check if it's a memory tool
    if (memoryToolsResult && (toolName === 'search_memory' || toolName === 'get_memory')) {
      return memoryToolsResult.handleToolCall(toolName, args)
    }
    // Otherwise it's an orbit tool
    return handleOrbitToolCall(toolName as keyof OrbitToolHandler, args, workingDir)
  }

  // Execute with Anthropic API
  let result = ''
  const newSessionId = sessionId || `${agentName}-${Date.now()}`

  try {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

    // Agentic loop - continue until no more tool calls
    let continueLoop = true
    while (continueLoop) {
      const response = await getAnthropicClient().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: systemPrompt,
        tools,
        messages,
      })

      // Process response
      const assistantContent: Anthropic.ContentBlock[] = []
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        assistantContent.push(block)

        if (block.type === 'text') {
          result = block.text
        } else if (block.type === 'tool_use') {
          // Handle tool call
          const toolResult = await handleToolCall(
            block.name as keyof OrbitToolHandler,
            block.input as Record<string, unknown>,
            workingDir,
          )

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: toolResult,
          })
        }
      }

      // Add assistant message
      messages.push({ role: 'assistant', content: assistantContent })

      // If there are tool results, add them and continue
      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults })
      } else {
        // No tool calls, we're done
        continueLoop = false
      }

      // Check stop reason
      if (response.stop_reason === 'end_turn' && toolResults.length === 0) {
        continueLoop = false
      }
    }

    // Mark inbox messages as read
    if (inbox.length > 0) {
      await markInboxRead(inbox.map(m => m.id))
    }

    // Update last active timestamp
    await updateAgentLastActive(agentName)

    // Write to daily memory
    await appendDailyMemory(agentName, {
      sessionType,
      prompt,
      result,
      timestamp: new Date(),
    })

    // Trigger async QMD index update (non-blocking)
    if (qmd.isQmdAvailable()) {
      qmd.updateIndex(agentName).catch(err => {
        logger.warn(`Failed to update QMD index for agent ${agentName}`, { error: err })
      })
    }

    logger.info(`Agent ${agentName} executed successfully`, {
      sessionType,
      sessionId: newSessionId,
    })

    return { result, sessionId: newSessionId }
  } catch (error) {
    logger.error(`Agent ${agentName} execution failed`, { error })
    throw error
  }
}
