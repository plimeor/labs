/**
 * BDD Tests for Agent Service
 *
 * Tests agent lifecycle management operations including:
 * - Creating agents
 * - Retrieving agents
 * - Listing agents
 * - Updating agent status
 * - Deleting agents
 * - Syncing agents with workspaces
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'

import { clearAllTables } from '../helpers/test-db'

// ============================================================
// Mock Workspace Service
// ============================================================

const mockWorkspaces = new Map<string, boolean>()

const mockCreateAgentWorkspace = mock(async (name: string) => {
  if (mockWorkspaces.get(name)) {
    throw new Error(`Agent workspace already exists: ${name}`)
  }
  mockWorkspaces.set(name, true)
  return `/tmp/orbit/agents/${name}`
})

const mockDeleteAgentWorkspace = mock(async (name: string) => {
  mockWorkspaces.delete(name)
})

const mockAgentWorkspaceExists = mock(async (name: string) => mockWorkspaces.has(name))

const mockListAgentWorkspaces = mock(async () => Array.from(mockWorkspaces.keys()))

const mockGetAgentWorkspacePath = (name: string) => `/tmp/orbit/agents/${name}`

// Mock the workspace module before importing agent service
mock.module('@/modules/agents/services/workspace.service', () => ({
  createAgentWorkspace: mockCreateAgentWorkspace,
  deleteAgentWorkspace: mockDeleteAgentWorkspace,
  agentWorkspaceExists: mockAgentWorkspaceExists,
  listAgentWorkspaces: mockListAgentWorkspaces,
  getAgentWorkspacePath: mockGetAgentWorkspacePath,
}))

// Now import the real agent service (will use mocked workspace)
import {
  createAgent,
  getAgent,
  getAgentById,
  listAgents,
  updateAgentLastActive,
  updateAgentStatus,
  deleteAgent,
  ensureAgent,
  syncAgentsWithWorkspaces,
} from '@/modules/agents/services/agent.service'

// ============================================================
// BDD Tests
// ============================================================

describe('Agent Service', () => {
  beforeEach(async () => {
    await clearAllTables()
    mockWorkspaces.clear()
    mockCreateAgentWorkspace.mockClear()
    mockDeleteAgentWorkspace.mockClear()
  })

  // ----------------------------------------------------------
  // Feature: Create Agent
  // ----------------------------------------------------------
  describe('Feature: Create Agent', () => {
    describe('Scenario: Successfully create a new agent', () => {
      it('Given no agent exists with name "orbit-assistant"', async () => {
        const existing = await getAgent('orbit-assistant')
        expect(existing).toBeUndefined()
      })

      it('When I create an agent with name "orbit-assistant"', async () => {
        const agent = await createAgent({ name: 'orbit-assistant' })
        expect(agent).toBeDefined()
        expect(agent.name).toBe('orbit-assistant')
      })

      it('Then the agent should be created with active status', async () => {
        await createAgent({ name: 'orbit-assistant' })
        const agent = await getAgent('orbit-assistant')
        expect(agent?.status).toBe('active')
      })

      it('And a workspace should be created for the agent', async () => {
        await createAgent({ name: 'orbit-assistant' })
        expect(mockCreateAgentWorkspace).toHaveBeenCalledWith(
          'orbit-assistant',
          'orbit-assistant',
          undefined,
        )
      })
    })

    describe('Scenario: Fail to create duplicate agent', () => {
      it('Given an agent "orbit-assistant" already exists', async () => {
        await createAgent({ name: 'orbit-assistant' })
        const existing = await getAgent('orbit-assistant')
        expect(existing).toBeDefined()
      })

      it('When I try to create another agent with name "orbit-assistant"', async () => {
        await createAgent({ name: 'orbit-assistant' })

        await expect(createAgent({ name: 'orbit-assistant' })).rejects.toThrow(
          'Agent already exists: orbit-assistant',
        )
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Get Agent
  // ----------------------------------------------------------
  describe('Feature: Get Agent', () => {
    describe('Scenario: Retrieve existing agent by name', () => {
      it('Given an agent "orbit-helper" exists in the database', async () => {
        await createAgent({ name: 'orbit-helper' })
      })

      it('When I get the agent by name "orbit-helper"', async () => {
        await createAgent({ name: 'orbit-helper' })
        const agent = await getAgent('orbit-helper')
        expect(agent).toBeDefined()
      })

      it('Then I should receive the agent details', async () => {
        await createAgent({ name: 'orbit-helper' })
        const agent = await getAgent('orbit-helper')
        expect(agent?.name).toBe('orbit-helper')
        expect(agent?.status).toBe('active')
        expect(agent?.workspacePath).toContain('orbit-helper')
      })
    })

    describe('Scenario: Retrieve agent by ID', () => {
      it('Given an agent exists with a known ID', async () => {
        const created = await createAgent({ name: 'test-agent' })
        expect(created.id).toBeGreaterThan(0)
      })

      it('When I get the agent by its ID', async () => {
        const created = await createAgent({ name: 'test-agent' })
        const agent = await getAgentById(created.id)
        expect(agent).toBeDefined()
        expect(agent?.id).toBe(created.id)
      })
    })

    describe('Scenario: Get non-existent agent returns undefined', () => {
      it('Given no agent "ghost-agent" exists', async () => {
        const agent = await getAgent('ghost-agent')
        expect(agent).toBeUndefined()
      })

      it('When I try to get "ghost-agent"', async () => {
        const agent = await getAgent('ghost-agent')
        expect(agent).toBeUndefined()
      })

      it('Then I should receive undefined', async () => {
        const result = await getAgent('ghost-agent')
        expect(result).toBeUndefined()
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: List Agents
  // ----------------------------------------------------------
  describe('Feature: List Agents', () => {
    describe('Scenario: List all agents when multiple exist', () => {
      it('Given multiple agents exist in the database', async () => {
        await createAgent({ name: 'agent-1' })
        await createAgent({ name: 'agent-2' })
        await createAgent({ name: 'agent-3' })
      })

      it('When I list all agents', async () => {
        await createAgent({ name: 'agent-1' })
        await createAgent({ name: 'agent-2' })
        await createAgent({ name: 'agent-3' })
        const agentList = await listAgents()
        expect(agentList.length).toBe(3)
      })

      it('Then I should receive all agents', async () => {
        await createAgent({ name: 'agent-1' })
        await createAgent({ name: 'agent-2' })
        await createAgent({ name: 'agent-3' })
        const agentList = await listAgents()
        const names = agentList.map(a => a.name)
        expect(names).toContain('agent-1')
        expect(names).toContain('agent-2')
        expect(names).toContain('agent-3')
      })
    })

    describe('Scenario: List agents when none exist', () => {
      it('Given no agents exist in the database', async () => {
        const agentList = await listAgents()
        expect(agentList.length).toBe(0)
      })

      it('When I list all agents', async () => {
        const agentList = await listAgents()
        expect(Array.isArray(agentList)).toBe(true)
      })

      it('Then I should receive an empty list', async () => {
        const agentList = await listAgents()
        expect(agentList).toEqual([])
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Update Agent Status
  // ----------------------------------------------------------
  describe('Feature: Update Agent Status', () => {
    describe('Scenario: Deactivate an active agent', () => {
      it('Given an active agent "worker-bot" exists', async () => {
        await createAgent({ name: 'worker-bot' })
        const agent = await getAgent('worker-bot')
        expect(agent?.status).toBe('active')
      })

      it('When I update the agent status to "inactive"', async () => {
        await createAgent({ name: 'worker-bot' })
        await updateAgentStatus('worker-bot', 'inactive')
      })

      it('Then the agent status should be "inactive"', async () => {
        await createAgent({ name: 'worker-bot' })
        await updateAgentStatus('worker-bot', 'inactive')
        const agent = await getAgent('worker-bot')
        expect(agent?.status).toBe('inactive')
      })
    })

    describe('Scenario: Reactivate an inactive agent', () => {
      it('Given an inactive agent exists', async () => {
        await createAgent({ name: 'sleeping-bot' })
        await updateAgentStatus('sleeping-bot', 'inactive')
        const agent = await getAgent('sleeping-bot')
        expect(agent?.status).toBe('inactive')
      })

      it('When I update the agent status to "active"', async () => {
        await createAgent({ name: 'sleeping-bot' })
        await updateAgentStatus('sleeping-bot', 'inactive')
        await updateAgentStatus('sleeping-bot', 'active')
      })

      it('Then the agent status should be "active"', async () => {
        await createAgent({ name: 'sleeping-bot' })
        await updateAgentStatus('sleeping-bot', 'inactive')
        await updateAgentStatus('sleeping-bot', 'active')
        const agent = await getAgent('sleeping-bot')
        expect(agent?.status).toBe('active')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Update Agent Last Active
  // ----------------------------------------------------------
  describe('Feature: Update Agent Last Active', () => {
    describe('Scenario: Record agent activity timestamp', () => {
      it('Given an agent with no last active timestamp', async () => {
        await createAgent({ name: 'lazy-bot' })
        const agent = await getAgent('lazy-bot')
        expect(agent?.lastActiveAt).toBeNull()
      })

      it('When the agent becomes active', async () => {
        await createAgent({ name: 'lazy-bot' })
        await updateAgentLastActive('lazy-bot')
      })

      it('Then the last active timestamp should be updated', async () => {
        await createAgent({ name: 'lazy-bot' })
        const before = new Date()
        await updateAgentLastActive('lazy-bot')
        const agent = await getAgent('lazy-bot')

        expect(agent?.lastActiveAt).toBeDefined()
        expect(agent?.lastActiveAt).not.toBeNull()
        expect(agent!.lastActiveAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Delete Agent
  // ----------------------------------------------------------
  describe('Feature: Delete Agent', () => {
    describe('Scenario: Successfully delete an existing agent', () => {
      it('Given an agent "temp-agent" exists', async () => {
        await createAgent({ name: 'temp-agent' })
        const agent = await getAgent('temp-agent')
        expect(agent).toBeDefined()
      })

      it('When I delete the agent "temp-agent"', async () => {
        await createAgent({ name: 'temp-agent' })
        await deleteAgent('temp-agent')
      })

      it('Then the agent should no longer exist in database', async () => {
        await createAgent({ name: 'temp-agent' })
        await deleteAgent('temp-agent')
        const agent = await getAgent('temp-agent')
        expect(agent).toBeUndefined()
      })

      it('And the agent workspace should be deleted', async () => {
        await createAgent({ name: 'temp-agent' })
        await deleteAgent('temp-agent')
        expect(mockDeleteAgentWorkspace).toHaveBeenCalledWith('temp-agent')
      })
    })

    describe('Scenario: Fail to delete non-existent agent', () => {
      it('Given no agent "phantom" exists', async () => {
        const agent = await getAgent('phantom')
        expect(agent).toBeUndefined()
      })

      it('When I try to delete "phantom"', async () => {
        await expect(deleteAgent('phantom')).rejects.toThrow('Agent not found: phantom')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Ensure Agent
  // ----------------------------------------------------------
  describe('Feature: Ensure Agent', () => {
    describe('Scenario: Ensure returns existing agent', () => {
      it('Given an agent "existing-bot" already exists', async () => {
        await createAgent({ name: 'existing-bot' })
      })

      it('When I ensure the agent "existing-bot"', async () => {
        await createAgent({ name: 'existing-bot' })
        const agent = await ensureAgent('existing-bot')
        expect(agent.name).toBe('existing-bot')
      })

      it('Then no new agent should be created', async () => {
        const original = await createAgent({ name: 'existing-bot' })
        const ensured = await ensureAgent('existing-bot')
        expect(ensured.id).toBe(original.id)
      })
    })

    describe('Scenario: Ensure creates new agent if not exists', () => {
      it('Given no agent "new-bot" exists', async () => {
        const agent = await getAgent('new-bot')
        expect(agent).toBeUndefined()
      })

      it('When I ensure the agent "new-bot"', async () => {
        const agent = await ensureAgent('new-bot')
        expect(agent).toBeDefined()
      })

      it('Then a new agent should be created', async () => {
        const agent = await ensureAgent('new-bot')
        expect(agent.name).toBe('new-bot')
        expect(agent.status).toBe('active')
      })
    })
  })

  // ----------------------------------------------------------
  // Feature: Sync Agents with Workspaces
  // ----------------------------------------------------------
  describe('Feature: Sync Agents with Workspaces', () => {
    describe('Scenario: Sync creates database entries for orphan workspaces', () => {
      it('Given workspaces exist on disk without database entries', async () => {
        // Simulate workspaces that exist on disk
        mockWorkspaces.set('orphan-agent-1', true)
        mockWorkspaces.set('orphan-agent-2', true)

        const dbAgents = await listAgents()
        expect(dbAgents.length).toBe(0)
      })

      it('When I sync agents with workspaces', async () => {
        mockWorkspaces.set('orphan-agent-1', true)
        mockWorkspaces.set('orphan-agent-2', true)
        await syncAgentsWithWorkspaces()
      })

      it('Then database entries should be created for orphan workspaces', async () => {
        mockWorkspaces.set('orphan-agent-1', true)
        mockWorkspaces.set('orphan-agent-2', true)
        await syncAgentsWithWorkspaces()

        const agent1 = await getAgent('orphan-agent-1')
        const agent2 = await getAgent('orphan-agent-2')

        expect(agent1).toBeDefined()
        expect(agent2).toBeDefined()
        expect(agent1?.status).toBe('active')
        expect(agent2?.status).toBe('active')
      })
    })

    describe('Scenario: Sync does not duplicate existing agents', () => {
      it('Given an agent exists both in database and on disk', async () => {
        await createAgent({ name: 'synced-agent' })
      })

      it('When I sync agents with workspaces', async () => {
        await createAgent({ name: 'synced-agent' })
        await syncAgentsWithWorkspaces()
      })

      it('Then no duplicate should be created', async () => {
        await createAgent({ name: 'synced-agent' })
        await syncAgentsWithWorkspaces()

        const agentList = await listAgents()
        const syncedAgents = agentList.filter(a => a.name === 'synced-agent')
        expect(syncedAgents.length).toBe(1)
      })
    })
  })
})
