import { describe, expect, it } from 'bun:test'

import { createPermissionHook } from '@/modules/agent/permissions'

describe('Permission Hook', () => {
  describe('allow-all mode', () => {
    it('should allow any tool', () => {
      const hook = createPermissionHook('allow-all')
      const result = hook({ toolName: 'Bash', toolInput: { command: 'rm -rf /' } })
      expect(result).toEqual({ decision: 'allow' })
    })
  })

  describe('safe mode', () => {
    it('should allow read-only tools', () => {
      const hook = createPermissionHook('safe')
      expect(hook({ toolName: 'Read', toolInput: {} })).toEqual({ decision: 'allow' })
      expect(hook({ toolName: 'Glob', toolInput: {} })).toEqual({ decision: 'allow' })
      expect(hook({ toolName: 'Grep', toolInput: {} })).toEqual({ decision: 'allow' })
      expect(hook({ toolName: 'WebFetch', toolInput: {} })).toEqual({ decision: 'allow' })
      expect(hook({ toolName: 'WebSearch', toolInput: {} })).toEqual({ decision: 'allow' })
    })

    it('should block write tools', () => {
      const hook = createPermissionHook('safe')
      expect(hook({ toolName: 'Write', toolInput: {} })).toEqual({
        decision: 'deny',
        reason: 'Safe mode: write operations not allowed'
      })
      expect(hook({ toolName: 'Edit', toolInput: {} })).toEqual({
        decision: 'deny',
        reason: 'Safe mode: write operations not allowed'
      })
      expect(hook({ toolName: 'Bash', toolInput: {} })).toEqual({
        decision: 'deny',
        reason: 'Safe mode: write operations not allowed'
      })
    })

    it('should allow MCP tools (orbit-tools, memory-tools)', () => {
      const hook = createPermissionHook('safe')
      expect(hook({ toolName: 'mcp__orbit-tools__schedule_task', toolInput: {} })).toEqual({
        decision: 'allow'
      })
      expect(hook({ toolName: 'mcp__memory-tools__search_memory', toolInput: {} })).toEqual({
        decision: 'allow'
      })
    })
  })
})
