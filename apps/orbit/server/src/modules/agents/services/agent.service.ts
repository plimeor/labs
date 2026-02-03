import { eq } from 'drizzle-orm'

import { agents, type Agent, type NewAgent } from '../../../../drizzle/schema/agents'
import { db } from '../../../core/db/client'
import {
  createAgentWorkspace,
  deleteAgentWorkspace,
  getAgentWorkspacePath,
  agentWorkspaceExists,
} from './workspace.service'

export interface CreateAgentParams {
  name: string
  displayName?: string
  description?: string
}

export async function createAgent(params: CreateAgentParams): Promise<Agent> {
  const { name, displayName, description } = params

  // Check if agent already exists
  const existing = await db.select().from(agents).where(eq(agents.name, name)).get()

  if (existing) {
    throw new Error(`Agent already exists: ${name}`)
  }

  // Create workspace on filesystem
  const workspacePath = await createAgentWorkspace(name, displayName, description)

  // Insert into database
  const newAgent: NewAgent = {
    name,
    displayName: displayName || name,
    workspacePath,
    status: 'active',
  }

  const result = await db.insert(agents).values(newAgent).returning()
  return result[0]
}

export async function getAgent(name: string): Promise<Agent | null> {
  const result = await db.select().from(agents).where(eq(agents.name, name)).get()

  return result || null
}

export async function getAgentById(id: number): Promise<Agent | null> {
  const result = await db.select().from(agents).where(eq(agents.id, id)).get()

  return result || null
}

export async function listAgents(): Promise<Agent[]> {
  return db.select().from(agents).all()
}

export async function updateAgentLastActive(name: string): Promise<void> {
  await db.update(agents).set({ lastActiveAt: new Date() }).where(eq(agents.name, name))
}

export async function updateAgentStatus(
  name: string,
  status: 'active' | 'inactive',
): Promise<void> {
  await db.update(agents).set({ status }).where(eq(agents.name, name))
}

export async function deleteAgent(name: string): Promise<void> {
  const agent = await getAgent(name)

  if (!agent) {
    throw new Error(`Agent not found: ${name}`)
  }

  // Delete from database first
  await db.delete(agents).where(eq(agents.name, name))

  // Delete workspace if it exists
  if (await agentWorkspaceExists(name)) {
    await deleteAgentWorkspace(name)
  }
}

export async function ensureAgent(name: string): Promise<Agent> {
  let agent = await getAgent(name)

  if (!agent) {
    agent = await createAgent({ name })
  }

  return agent
}

export async function syncAgentsWithWorkspaces(): Promise<void> {
  const { listAgentWorkspaces } = await import('./workspace.service')
  const workspaces = await listAgentWorkspaces()
  const dbAgents = await listAgents()
  const dbAgentNames = new Set(dbAgents.map(a => a.name))

  // Create DB entries for workspaces that don't have them
  for (const name of workspaces) {
    if (!dbAgentNames.has(name)) {
      const workspacePath = getAgentWorkspacePath(name)
      await db.insert(agents).values({
        name,
        displayName: name,
        workspacePath,
        status: 'active',
      })
    }
  }
}
