import { join } from 'node:path'

import { uniq } from 'es-toolkit/array'
import * as v from 'valibot'

import { Files } from './files.js'
import {
  type ProjectEntry,
  ProjectIdSchema,
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
    id: string
    repoUrl: string
  }
): Promise<ProjectEntry> {
  const id = normalizeProjectId(input.id)
  const repoUrl = v.parse(TextSchema, input.repoUrl)
  const document = await readProjects(workspace)
  if (document.projects.some(project => project.id === id)) {
    throw new Error(`Project already exists: ${id}`)
  }

  const entry: ProjectEntry = {
    defaultBranch: 'HEAD',
    displayName: id,
    id,
    managedRepoPath: join('.code-wiki', 'repos', id),
    repoUrl,
    wikiPath: join('.code-wiki', 'projects', id)
  }
  const projects = [...document.projects, entry].sort((a, b) => a.id.localeCompare(b.id))
  await writeProjects(workspace, { projects, schemaVersion: 1 })
  return entry
}

export function requireProject(document: ProjectsDocument, projectId: string): ProjectEntry {
  const id = normalizeProjectId(projectId)
  const project = document.projects.find(entry => entry.id === id)
  if (!project) {
    throw new Error(`Unknown project: ${id}`)
  }

  return project
}

export function normalizeProjectId(input: unknown): string {
  return v.parse(ProjectIdSchema, input)
}

export function normalizeProjectIds(input: string): string[] {
  const ids = uniq(
    input
      .split(',')
      .map(value => normalizeProjectId(value))
      .filter(Boolean)
  )
  if (ids.length === 0) {
    throw new Error('--projects requires at least one project id')
  }

  return ids
}
