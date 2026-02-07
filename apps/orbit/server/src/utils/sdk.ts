import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

/**
 * Extract result text from an SDK message.
 * Returns the result string if the message is a result type, undefined otherwise.
 */
export function extractResultText(message: SDKMessage): string | undefined {
  if (message.type !== 'result') return undefined
  return (message as unknown as { result?: string }).result
}
