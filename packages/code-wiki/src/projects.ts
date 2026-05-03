import * as v from 'valibot'

import { Files } from './files.js'
import {
  normalizeProjectId,
  type ProjectEntry,
  ProjectEntrySchema,
  type ProjectsDocument,
  ProjectsDocumentSchema
} from './types.js'
import { statePath, type Workspace } from './workspace.js'

export function projectsPath(workspace: Workspace): string {
  return statePath(workspace, 'projects.json')
}

export async function readProjects(workspace: Workspace): Promise<ProjectsDocument> {
  return Files.readJson(projectsPath(workspace), input => v.parse(ProjectsDocumentSchema, input))
}

export async function writeProjects(workspace: Workspace, document: ProjectsDocument): Promise<void> {
  await Files.writeJson(projectsPath(workspace), v.parse(ProjectsDocumentSchema, document))
}

export async function addProject(
  workspace: Workspace,
  input: {
    id: string
    ref?: string
    repoUrl: string
  }
): Promise<ProjectEntry> {
  const id = normalizeProjectId(input.id)
  const document = await readProjects(workspace)
  if (document.projects.some(project => project.id === id)) {
    throw new Error(`Project already exists: ${id}`)
  }

  const entry = v.parse(ProjectEntrySchema, {
    id,
    ...(input.ref ? { ref: input.ref } : {}),
    repoUrl: input.repoUrl
  })
  const projects = [...document.projects, entry].sort((a, b) => a.id.localeCompare(b.id))
  await writeProjects(workspace, { projects, schemaVersion: 1 })
  return entry
}

export async function updateProject(
  workspace: Workspace,
  projectId: string,
  input: {
    ref?: string
    repoUrl?: string
  }
): Promise<ProjectEntry> {
  const id = normalizeProjectId(projectId)
  const document = await readProjects(workspace)
  const index = document.projects.findIndex(project => project.id === id)
  if (index < 0) {
    throw new Error(`Unknown project: ${id}`)
  }

  const current = document.projects[index]
  const updated: ProjectEntry = {
    ...current,
    ...(input.repoUrl ? { repoUrl: input.repoUrl } : {})
  }
  setProjectRef(updated, input.ref)
  const projects = [...document.projects]
  projects[index] = v.parse(ProjectEntrySchema, updated)
  await writeProjects(workspace, { projects, schemaVersion: 1 })
  return projects[index]
}

export function requireProject(document: ProjectsDocument, projectId: string): ProjectEntry {
  const id = normalizeProjectId(projectId)
  const project = document.projects.find(entry => entry.id === id)
  if (!project) {
    throw new Error(`Unknown project: ${id}`)
  }

  return project
}

function setProjectRef(project: ProjectEntry, ref: string | undefined): void {
  if (ref === undefined) {
    return
  }

  project.ref = ref
}
