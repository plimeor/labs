/**
 * Generate a unique ID combining timestamp and random suffix.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const AGENT_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

/**
 * Validate agent name to prevent path traversal and invalid characters.
 * Only allows alphanumeric, hyphens, and underscores (max 64 chars).
 */
export function isValidAgentName(name: string): boolean {
  return name.length > 0 && name.length <= 64 && AGENT_NAME_PATTERN.test(name)
}
