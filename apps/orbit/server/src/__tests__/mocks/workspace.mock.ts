/**
 * Mock for Workspace Service
 *
 * Provides a controllable mock of workspace operations for testing
 * without touching the real filesystem.
 */

// ============================================================
// Types
// ============================================================

export interface MockWorkspaceState {
  /** Map of agent name to workspace existence */
  workspaces: Map<string, boolean>

  /** Map of agent name to workspace path */
  workspacePaths: Map<string, string>

  /** List of all agent workspaces created */
  createdWorkspaces: string[]

  /** List of all agent workspaces deleted */
  deletedWorkspaces: string[]

  /** Track orbit dirs ensured */
  orbitDirsEnsured: boolean
}

// ============================================================
// Mock State
// ============================================================

const MOCK_BASE_PATH = '/tmp/test-orbit'
const MOCK_AGENTS_PATH = `${MOCK_BASE_PATH}/agents`

/**
 * Create fresh mock state
 */
export function createMockWorkspaceState(): MockWorkspaceState {
  return {
    workspaces: new Map(),
    workspacePaths: new Map(),
    createdWorkspaces: [],
    deletedWorkspaces: [],
    orbitDirsEnsured: false
  }
}

// Global mock state
let mockState = createMockWorkspaceState()

/**
 * Reset the mock state
 */
export function resetMockWorkspace(): void {
  mockState = createMockWorkspaceState()
}

/**
 * Get current mock state (for assertions)
 */
export function getMockWorkspaceState(): MockWorkspaceState {
  return mockState
}

// ============================================================
// Mock Service Functions
// ============================================================

/**
 * Mock: Get orbit base path
 */
export function getOrbitBasePath(): string {
  return MOCK_BASE_PATH
}

/**
 * Mock: Get agents path
 */
export function getAgentsPath(): string {
  return MOCK_AGENTS_PATH
}

/**
 * Mock: Get agent workspace path
 */
export function getAgentWorkspacePath(agentName: string): string {
  return mockState.workspacePaths.get(agentName) ?? `${MOCK_AGENTS_PATH}/${agentName}`
}

/**
 * Mock: Get agent working directory
 */
export function getAgentWorkingDir(agentName: string): string {
  return `${getAgentWorkspacePath(agentName)}/workspace`
}

/**
 * Mock: Ensure orbit directories exist
 */
export async function ensureOrbitDirs(): Promise<void> {
  mockState.orbitDirsEnsured = true
}

/**
 * Mock: Create agent workspace
 */
export async function createAgentWorkspace(
  agentName: string,
  _displayName?: string,
  _description?: string
): Promise<string> {
  if (mockState.workspaces.get(agentName)) {
    throw new Error(`Agent workspace already exists: ${agentName}`)
  }

  const workspacePath = `${MOCK_AGENTS_PATH}/${agentName}`

  mockState.workspaces.set(agentName, true)
  mockState.workspacePaths.set(agentName, workspacePath)
  mockState.createdWorkspaces.push(agentName)

  return workspacePath
}

/**
 * Mock: Check if agent workspace exists
 */
export async function agentWorkspaceExists(agentName: string): Promise<boolean> {
  return mockState.workspaces.get(agentName) ?? false
}

/**
 * Mock: List agent workspaces
 */
export async function listAgentWorkspaces(): Promise<string[]> {
  return Array.from(mockState.workspaces.entries())
    .filter(([_, exists]) => exists)
    .map(([name]) => name)
}

/**
 * Mock: Delete agent workspace
 */
export async function deleteAgentWorkspace(agentName: string): Promise<void> {
  if (!mockState.workspaces.get(agentName)) {
    throw new Error(`Agent workspace not found: ${agentName}`)
  }

  mockState.workspaces.set(agentName, false)
  mockState.deletedWorkspaces.push(agentName)
}

// ============================================================
// Test Setup Helpers
// ============================================================

/**
 * Pre-create a workspace for testing
 */
export function setupWorkspace(agentName: string): void {
  const workspacePath = `${MOCK_AGENTS_PATH}/${agentName}`
  mockState.workspaces.set(agentName, true)
  mockState.workspacePaths.set(agentName, workspacePath)
}

/**
 * Pre-create multiple workspaces for testing
 */
export function setupWorkspaces(agentNames: string[]): void {
  for (const name of agentNames) {
    setupWorkspace(name)
  }
}

// ============================================================
// Export Mock Module
// ============================================================

export const mockWorkspaceService = {
  getOrbitBasePath,
  getAgentsPath,
  getAgentWorkspacePath,
  getAgentWorkingDir,
  ensureOrbitDirs,
  createAgentWorkspace,
  agentWorkspaceExists,
  listAgentWorkspaces,
  deleteAgentWorkspace
}
