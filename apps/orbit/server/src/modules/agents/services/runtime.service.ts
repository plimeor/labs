import Anthropic from '@anthropic-ai/sdk'
import { logger } from '@plimeor-labs/logger'

import { createOrbitTools, type OrbitToolHandler } from '../tools/orbit-tools'
import { getAgent, getAgentById, updateAgentLastActive } from './agent.service'
import { composeSystemPrompt, type SessionType, type InboxMessage } from './context.service'
import { checkInboxByName, markInboxRead } from './inbox.service'
import { appendDailyMemory } from './memory.service'
import { getAgentWorkingDir } from './workspace.service'

const anthropic = new Anthropic()

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
  const { tools, handleToolCall } = createOrbitTools(agentName, agent.id)

  // Execute with Anthropic API
  let result = ''
  const newSessionId = sessionId || `${agentName}-${Date.now()}`

  try {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

    // Agentic loop - continue until no more tool calls
    let continueLoop = true
    while (continueLoop) {
      const response = await anthropic.messages.create({
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
