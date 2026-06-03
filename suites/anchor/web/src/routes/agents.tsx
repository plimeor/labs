import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useState } from 'react'

import { AgentTranscript } from '../components/AgentTranscript'
import { permissionModeConfig } from '../domain/agent-session'
import type { AgentTask, PermissionMode, ProposedChange, SourceRef } from '../domain/types'
import { useAnchor } from '../lib/anchor-context'
import { formatRecordMap } from './-shared'

export const Route = createFileRoute('/agents')({
  component: AgentsRoute
})

const PERMISSION_MODES: PermissionMode[] = ['safe', 'ask', 'allow-all']

function AgentsRoute() {
  const anchor = useAnchor()
  const queryClient = useQueryClient()
  const connections = useQuery({
    queryKey: ['agent-connections', anchor.vaultRevision],
    queryFn: () => anchor.backend.listAgentConnections()
  })
  const tasks = useQuery({
    queryKey: ['agent-tasks', anchor.vaultRevision],
    queryFn: () => anchor.backend.listAgentTasks()
  })
  const proposedChanges = useQuery({
    queryKey: ['proposed-changes', anchor.vaultRevision],
    queryFn: () => anchor.backend.getProposedChanges()
  })
  const [title, setTitle] = useState('Create a source-backed reference and propose one safe follow-up')
  const [mode, setMode] = useState<PermissionMode>('ask')
  const latestTask = tasks.data?.[0]
  const latestTaskSourceRefs = collectTaskSourceRefs(latestTask)
  const createTask = useMutation({
    mutationFn: () =>
      anchor.backend.createAgentTask({
        permissionMode: mode,
        targetNoteId: anchor.currentNote?.metadata.id,
        title
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      anchor.refreshApp()
    }
  })
  const acceptChange = async (id: string) => {
    await anchor.backend.applyProposedChange(id)
    void queryClient.invalidateQueries()
    anchor.refreshApp()
  }
  const rejectChange = async (id: string) => {
    await anchor.backend.rejectProposedChange(id)
    void queryClient.invalidateQueries()
    anchor.refreshApp()
  }

  return (
    <div className="agents-route" data-testid="agents-route">
      <header className="route-header">
        <div>
          <p>Agents</p>
          <h1>Scoped task surface</h1>
        </div>
      </header>
      <section className="agent-composer">
        <input value={title} onInput={event => setTitle(event.currentTarget.value)} />
        <div className="agent-mode-row">
          {PERMISSION_MODES.map(item => (
            <button key={item} className={mode === item ? 'active' : ''} type="button" onClick={() => setMode(item)}>
              {permissionModeConfig[item].shortName}
            </button>
          ))}
        </div>
        <button
          className="primary-action"
          data-testid="create-agent-task"
          type="button"
          onClick={() => createTask.mutate()}
        >
          Start task
        </button>
      </section>
      <div className="agent-layout">
        <section className="connection-list">
          <h2>Connections</h2>
          {(connections.data ?? []).map(connection => (
            <div key={connection.id} className="connection-row">
              <strong>{connection.displayName}</strong>
              <span>{connection.healthState}</span>
              <small>{permissionModeConfig[connection.defaultMode].displayName}</small>
            </div>
          ))}
        </section>
        <section className="transcript-panel">
          {latestTask ? (
            <AgentTranscript
              task={latestTask}
              onModeChange={async nextMode => {
                await anchor.backend.setTaskPermissionMode(latestTask.id, nextMode)
                void queryClient.invalidateQueries({ queryKey: ['agent-tasks', anchor.vaultRevision] })
              }}
            />
          ) : (
            <p className="muted">Start from an empty task or bind the currently open note as scope.</p>
          )}
        </section>
        <section className="approval-panel" data-testid="approval-panel">
          <h2>Approval</h2>
          {(proposedChanges.data ?? []).map(change => (
            <ApprovalCard
              key={change.id}
              change={change}
              sourceRefs={latestTaskSourceRefs}
              onAccept={() => void acceptChange(change.id)}
              onReject={() => void rejectChange(change.id)}
            />
          ))}
        </section>
      </div>
    </div>
  )
}

function ApprovalCard(props: {
  change: ProposedChange
  onAccept: () => void
  onReject: () => void
  sourceRefs: SourceRef[]
}) {
  return (
    <article className="approval-card" data-testid="approval-card">
      <div className="approval-card-header">
        <div>
          <strong>{props.change.diff[0]?.title ?? props.change.id}</strong>
          <small>{props.change.id}</small>
        </div>
        <span className="status-pill">{props.change.approvalState}</span>
      </div>
      <div className="approval-meta" data-testid="approval-metadata">
        <span>Mode: {props.change.mode}</span>
        <span>Metadata: {props.change.metadataImpact}</span>
        <span>Graph: {props.change.graphImpact}</span>
        <span>Targets: {props.change.targetNoteIds.join(', ')}</span>
        <span>Base: {formatRecordMap(props.change.baseRevisions)}</span>
        <span>Provenance: {props.change.provenance}</span>
      </div>
      {props.sourceRefs.length > 0 ? (
        <div className="source-ref-list">
          {props.sourceRefs.map(source => (
            <span key={source.id} className="source-ref-chip" data-testid="source-ref-chip">
              {source.label}
            </span>
          ))}
        </div>
      ) : null}
      {props.change.diff.map(diff => (
        <div key={`${diff.noteId}:${diff.title}`} className="diff-grid">
          <section className="diff-pane">
            <h3>Before</h3>
            <pre>{diff.before}</pre>
          </section>
          <section className="diff-pane">
            <h3>After</h3>
            <pre>{diff.after}</pre>
          </section>
        </div>
      ))}
      {props.change.approvalState === 'pending' ? (
        <div className="approval-actions">
          <button data-testid="accept-proposed-change" type="button" onClick={props.onAccept}>
            <Check size={14} />
            Accept
          </button>
          <button type="button" onClick={props.onReject}>
            Reject
          </button>
        </div>
      ) : null}
    </article>
  )
}

function collectTaskSourceRefs(task: AgentTask | undefined): SourceRef[] {
  if (!task) {
    return []
  }

  const sourceRefs = new Map<string, SourceRef>()
  for (const sourceRef of task.context.explicitSources) {
    sourceRefs.set(sourceRef.id, sourceRef)
  }
  for (const output of task.outputs) {
    if (output.kind !== 'reference') {
      continue
    }
    for (const sourceRef of output.sourceRefs) {
      sourceRefs.set(sourceRef.id, sourceRef)
    }
  }

  return [...sourceRefs.values()]
}
