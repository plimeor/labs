import * as v from 'valibot'

import { Files } from './files.js'
import { normalizeGitRemote } from './git.js'
import { normalizeProjectId, type ProjectEntry, type ProjectsDocument, ProjectsDocumentSchema } from './types.js'
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
    branch?: string
    commit?: string
    id: string
    repoUrl: string
    tag?: string
  }
): Promise<ProjectEntry> {
  const id = normalizeProjectId(input.id)
  const remote = normalizeGitRemote(v.parse(v.pipe(v.string(), v.trim(), v.minLength(1)), input.repoUrl))
  const repoUrl = remote.repoUrl
  const document = await readProjects(workspace)
  if (document.projects.some(project => project.id === id)) {
    throw new Error(`Project already exists: ${id}`)
  }

  const entry: ProjectEntry = {
    ...(input.branch ? { branch: v.parse(v.pipe(v.string(), v.trim(), v.minLength(1)), input.branch) } : {}),
    ...(input.commit ? { commit: v.parse(v.pipe(v.string(), v.trim(), v.minLength(1)), input.commit) } : {}),
    id,
    repoUrl,
    ...(input.tag ? { tag: v.parse(v.pipe(v.string(), v.trim(), v.minLength(1)), input.tag) } : {})
  }
  const projects = [...document.projects, entry].sort((a, b) => a.id.localeCompare(b.id))
  await writeProjects(workspace, { projects, schemaVersion: 1 })
  return entry
}

export async function updateProject(
  workspace: Workspace,
  projectId: string,
  input: {
    branch?: string
    commit?: string
    repoUrl?: string
    tag?: string
  }
): Promise<ProjectEntry> {
  const id = normalizeProjectId(projectId)
  const document = await readProjects(workspace)
  const index = document.projects.findIndex(project => project.id === id)
  if (index < 0) {
    throw new Error(`Unknown project: ${id}`)
  }

  const current = document.projects[index]
  const remote = input.repoUrl
    ? normalizeGitRemote(v.parse(v.pipe(v.string(), v.trim(), v.minLength(1)), input.repoUrl))
    : undefined
  const updated: ProjectEntry = {
    ...current,
    ...(remote ? { repoUrl: remote.repoUrl } : {})
  }
  setProjectRef(updated, {
    branch: input.branch,
    commit: input.commit,
    tag: input.tag
  })
  const projects = [...document.projects]
  projects[index] = updated
  await writeProjects(workspace, { projects, schemaVersion: 1 })
  return updated
}

export function requireProject(document: ProjectsDocument, projectId: string): ProjectEntry {
  const id = normalizeProjectId(projectId)
  const project = document.projects.find(entry => entry.id === id)
  if (!project) {
    throw new Error(`Unknown project: ${id}`)
  }

  return project
}

function setProjectRef(project: ProjectEntry, input: { branch?: string; commit?: string; tag?: string }): void {
  if (input.branch === undefined && input.commit === undefined && input.tag === undefined) {
    return
  }

  delete project.branch
  delete project.commit
  delete project.tag

  if (input.branch !== undefined) {
    project.branch = v.parse(v.pipe(v.string(), v.trim(), v.minLength(1)), input.branch)
  }
  if (input.commit !== undefined) {
    project.commit = v.parse(v.pipe(v.string(), v.trim(), v.minLength(1)), input.commit)
  }
  if (input.tag !== undefined) {
    project.tag = v.parse(v.pipe(v.string(), v.trim(), v.minLength(1)), input.tag)
  }
}
