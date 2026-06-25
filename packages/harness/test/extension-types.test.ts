import { describe, expect, test } from 'bun:test'

import type { HarnessExtension } from '../src/index'

describe('extension contract', () => {
  test('accepts the approved user-scope extension resource shape', () => {
    const extension: HarnessExtension = {
      id: 'team-tools',
      resources: {
        skills: ['./skills/review.md', '/opt/shared/skills'],
        hooks: [
          {
            command: 'bun run hooks/pre-tool.ts',
            event: 'PreToolUse',
            name: 'pre-tool'
          }
        ],
        mcpServers: {
          docs: {
            args: ['server.ts'],
            command: 'bun',
            env: { DOCS_ROOT: '/tmp/docs' }
          }
        }
      }
    }

    expect(extension.resources.skills?.[0]).toBe('./skills/review.md')
    expect(extension.resources.mcpServers?.docs.command).toBe('bun')
  })

  test('keeps install and uninstall on the adapter-owned extension facet', () => {
    const extension: HarnessExtension = {
      id: 'empty',
      resources: {}
    }

    expect(extension.resources).toEqual({})
  })
})
