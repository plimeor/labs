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

import { beforeEach, describe, expect, it, mock } from 'bun:test'

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
  getAgentWorkspacePath: mockGetAgentWorkspacePath
}))

// Now import the real agent service (will use mocked workspace)
import {
  createAgent,
  deleteAgent,
  ensureAgent,
  getAgent,
  getAgentById,
  listAgents,
  syncAgentsWithWorkspaces,
  updateAgentLastActive,
  updateAgentStatus
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
    it('should create a new agent with active status and workspace', async () => {
      const agent = await createAgent({ name: 'orbit-assistant' })

      expect(agent.name).toBe('orbit-assistant')
      expect(agent.status).toBe('active')
      expect(mockCreateAgentWorkspace).toHaveBeenCalledWith('orbit-assistant', 'orbit-assistant', undefined)
    })

    it('should fail to create duplicate agent', async () => {
      await createAgent({ name: 'orbit-assistant' })

      await expect(createAgent({ name: 'orbit-assistant' })).rejects.toThrow('Agent already exists: orbit-assistant')
    })
  })

  // ----------------------------------------------------------
  // Feature: Get Agent
  // ----------------------------------------------------------
  describe('Feature: Get Agent', () => {
    it('should retrieve existing agent by name with full details', async () => {
      await createAgent({ name: 'orbit-helper' })

      const agent = await getAgent('orbit-helper')

      expect(agent?.name).toBe('orbit-helper')
      expect(agent?.status).toBe('active')
      expect(agent?.workspacePath).toContain('orbit-helper')
    })

    it('should retrieve agent by ID', async () => {
      const created = await createAgent({ name: 'test-agent' })

      const agent = await getAgentById(created.id)

      expect(agent).toBeDefined()
      expect(agent?.id).toBe(created.id)
    })

    it('should return undefined for non-existent agent', async () => {
      const agent = await getAgent('ghost-agent')
      expect(agent).toBeUndefined()
    })
  })

  // ----------------------------------------------------------
  // Feature: List Agents
  // ----------------------------------------------------------
  describe('Feature: List Agents', () => {
    it('should list all agents when multiple exist', async () => {
      await createAgent({ name: 'agent-1' })
      await createAgent({ name: 'agent-2' })
      await createAgent({ name: 'agent-3' })

      const agentList = await listAgents()
      const names = agentList.map(a => a.name)

      expect(agentList.length).toBe(3)
      expect(names).toContain('agent-1')
      expect(names).toContain('agent-2')
      expect(names).toContain('agent-3')
    })

    it('should return empty list when no agents exist', async () => {
      const agentList = await listAgents()
      expect(agentList).toEqual([])
    })
  })

  // ----------------------------------------------------------
  // Feature: Update Agent Status
  // ----------------------------------------------------------
  describe('Feature: Update Agent Status', () => {
    it('should deactivate an active agent', async () => {
      await createAgent({ name: 'worker-bot' })

      await updateAgentStatus('worker-bot', 'inactive')

      const agent = await getAgent('worker-bot')
      expect(agent?.status).toBe('inactive')
    })

    it('should reactivate an inactive agent', async () => {
      await createAgent({ name: 'sleeping-bot' })
      await updateAgentStatus('sleeping-bot', 'inactive')

      await updateAgentStatus('sleeping-bot', 'active')

      const agent = await getAgent('sleeping-bot')
      expect(agent?.status).toBe('active')
    })
  })

  // ----------------------------------------------------------
  // Feature: Update Agent Last Active
  // ----------------------------------------------------------
  describe('Feature: Update Agent Last Active', () => {
    it('should record agent activity timestamp', async () => {
      await createAgent({ name: 'lazy-bot' })
      const before = new Date()

      await updateAgentLastActive('lazy-bot')

      const agent = await getAgent('lazy-bot')
      expect(agent?.lastActiveAt).not.toBeNull()
      expect(agent?.lastActiveAt?.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000)
    })
  })

  // ----------------------------------------------------------
  // Feature: Delete Agent
  // ----------------------------------------------------------
  describe('Feature: Delete Agent', () => {
    it('should delete agent from database and workspace', async () => {
      await createAgent({ name: 'temp-agent' })

      await deleteAgent('temp-agent')

      const agent = await getAgent('temp-agent')
      expect(agent).toBeUndefined()
      expect(mockDeleteAgentWorkspace).toHaveBeenCalledWith('temp-agent')
    })

    it('should fail to delete non-existent agent', async () => {
      await expect(deleteAgent('phantom')).rejects.toThrow('Agent not found: phantom')
    })
  })

  // ----------------------------------------------------------
  // Feature: Ensure Agent
  // ----------------------------------------------------------
  describe('Feature: Ensure Agent', () => {
    it('should return existing agent without creating new one', async () => {
      const original = await createAgent({ name: 'existing-bot' })

      const ensured = await ensureAgent('existing-bot')

      expect(ensured.id).toBe(original.id)
      expect(ensured.name).toBe('existing-bot')
    })

    it('should create new agent if not exists', async () => {
      const agent = await ensureAgent('new-bot')

      expect(agent.name).toBe('new-bot')
      expect(agent.status).toBe('active')
    })
  })

  // ----------------------------------------------------------
  // Feature: Sync Agents with Workspaces
  // ----------------------------------------------------------
  describe('Feature: Sync Agents with Workspaces', () => {
    it('should create database entries for orphan workspaces', async () => {
      mockWorkspaces.set('orphan-agent-1', true)
      mockWorkspaces.set('orphan-agent-2', true)

      await syncAgentsWithWorkspaces()

      const agent1 = await getAgent('orphan-agent-1')
      const agent2 = await getAgent('orphan-agent-2')
      expect(agent1).toBeDefined()
      expect(agent2).toBeDefined()
      expect(agent1?.status).toBe('active')
    })

    it('should not duplicate existing agents during sync', async () => {
      await createAgent({ name: 'synced-agent' })

      await syncAgentsWithWorkspaces()

      const agentList = await listAgents()
      const syncedAgents = agentList.filter(a => a.name === 'synced-agent')
      expect(syncedAgents.length).toBe(1)
    })
  })
})
