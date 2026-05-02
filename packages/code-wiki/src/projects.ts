import { join } from 'node:path'

import { uniq } from 'es-toolkit/array'
import * as v from 'valibot'

import { Files } from './files.js'
import { normalizeGitRemote } from './git.js'
import { splitCommaList } from './strings.js'
import {
  normalizeProjectId,
  type ProjectEntry,
  type ProjectsDocument,
  ProjectsDocumentSchema,
  TextSchema
} from './types.js'
import { assertMode, statePath, type Workspace } from './workspace.js'

export function projectsPath(workspace: Workspace): string {
  return statePath(workspace, 'projects.json')
}

export async function readProjects(workspace: Workspace): Promise<ProjectsDocument> {
  assertMode(workspace, 'shared')
  return Files.readJson(projectsPath(workspace), input => v.parse(ProjectsDocumentSchema, input))
}

export async function writeProjects(workspace: Workspace, document: ProjectsDocument): Promise<void> {
  assertMode(workspace, 'shared')
  await Files.writeJson(projectsPath(workspace), v.parse(ProjectsDocumentSchema, document))
}

export async function addProject(
  workspace: Workspace,
  input: {
    displayName?: string
    exclude?: string[]
    id: string
    include?: string[]
    ref?: string
    repoUrl: string
  }
): Promise<ProjectEntry> {
  const id = normalizeProjectId(input.id)
  const remote = normalizeGitRemote(v.parse(TextSchema, input.repoUrl))
  const repoUrl = remote.repoUrl
  const ref = v.parse(TextSchema, input.ref ?? remote.ref ?? 'HEAD')
  const document = await readProjects(workspace)
  if (document.projects.some(project => project.id === id)) {
    throw new Error(`Project already exists: ${id}`)
  }

  const entry: ProjectEntry = {
    displayName: input.displayName ?? id,
    ...(input.exclude && input.exclude.length > 0 ? { exclude: input.exclude } : {}),
    id,
    ...(input.include && input.include.length > 0 ? { include: input.include } : {}),
    managedRepoPath: join('.code-wiki', 'repos', id),
    ref,
    repoUrl,
    wikiPath: join('.code-wiki', 'projects', id)
  }
  const projects = [...document.projects, entry].sort((a, b) => a.id.localeCompare(b.id))
  await writeProjects(workspace, { projects, schemaVersion: 1 })
  return entry
}

export async function updateProject(
  workspace: Workspace,
  projectId: string,
  input: {
    exclude?: string[]
    include?: string[]
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
  const remote = input.repoUrl ? normalizeGitRemote(v.parse(TextSchema, input.repoUrl)) : undefined
  const nextRef = input.ref ?? remote?.ref
  const updated: ProjectEntry = {
    ...current,
    ...(input.exclude === undefined ? {} : { exclude: input.exclude }),
    ...(input.include === undefined ? {} : { include: input.include }),
    ...(remote ? { repoUrl: remote.repoUrl } : {}),
    ...(nextRef === undefined ? {} : { ref: v.parse(TextSchema, nextRef) })
  }
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

export function normalizeProjectIds(input: string): string[] {
  const ids = uniq((splitCommaList(input) ?? []).map(value => normalizeProjectId(value)))
  if (ids.length === 0) {
    throw new Error('--projects requires at least one project id')
  }

  return ids
}
