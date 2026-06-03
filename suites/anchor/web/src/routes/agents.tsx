import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import { Check } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'

import { AgentTranscript } from '../components/AgentTranscript'
import { permissionModeConfig } from '../domain/agent-session'
import type { AgentTask, PermissionMode, ProposedChange, SourceRef } from '../domain/types'
import { useAnchor } from '../lib/anchor-context'
import { formatRecordMap } from './-shared'

export const Route = createFileRoute('/agents')({
  component: AgentsRoute
})

function AgentsRoute() {
  const anchor = useAnchor()
  const queryClient = useQueryClient()
  const connections = useQuery(() => ({
    queryKey: ['agent-connections', anchor.vaultRevision()],
    queryFn: () => anchor.backend.listAgentConnections()
  }))
  const tasks = useQuery(() => ({
    queryKey: ['agent-tasks', anchor.vaultRevision()],
    queryFn: () => anchor.backend.listAgentTasks()
  }))
  const proposedChanges = useQuery(() => ({
    queryKey: ['proposed-changes', anchor.vaultRevision()],
    queryFn: () => anchor.backend.getProposedChanges()
  }))
  const [title, setTitle] = createSignal('Create a source-backed reference and propose one safe follow-up')
  const [mode, setMode] = createSignal<PermissionMode>('ask')
  const latestTask = createMemo<AgentTask | undefined>(() => tasks.data?.[0])
  const latestTaskSourceRefs = createMemo(() => collectTaskSourceRefs(latestTask()))
  const createTask = useMutation(() => ({
    mutationFn: () =>
      anchor.backend.createAgentTask({
        permissionMode: mode(),
        targetNoteId: anchor.currentNote()?.metadata.id,
        title: title()
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries()
      anchor.refreshApp()
    }
  }))
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
    <div class="agents-route" data-testid="agents-route">
      <header class="route-header">
        <div>
          <p>Agents</p>
          <h1>Scoped task surface</h1>
        </div>
      </header>
      <section class="agent-composer">
        <input value={title()} onInput={event => setTitle(event.currentTarget.value)} />
        <div class="agent-mode-row">
          <For each={['safe', 'ask', 'allow-all'] as PermissionMode[]}>
            {item => (
              <button class={mode() === item ? 'active' : ''} type="button" onClick={() => setMode(item)}>
                {permissionModeConfig[item].shortName}
              </button>
            )}
          </For>
        </div>
        <button
          class="primary-action"
          data-testid="create-agent-task"
          type="button"
          onClick={() => createTask.mutate()}
        >
          Start task
        </button>
      </section>
      <div class="agent-layout">
        <section class="connection-list">
          <h2>Connections</h2>
          <For each={connections.data ?? []}>
            {connection => (
              <div class="connection-row">
                <strong>{connection.displayName}</strong>
                <span>{connection.healthState}</span>
                <small>{permissionModeConfig[connection.defaultMode].displayName}</small>
              </div>
            )}
          </For>
        </section>
        <section class="transcript-panel">
          <Show
            when={latestTask()}
            fallback={<p class="muted">Start from an empty task or bind the currently open note as scope.</p>}
          >
            {task => (
              <AgentTranscript
                task={task()}
                onModeChange={async nextMode => {
                  await anchor.backend.setTaskPermissionMode(task().id, nextMode)
                  void queryClient.invalidateQueries({ queryKey: ['agent-tasks', anchor.vaultRevision()] })
                }}
              />
            )}
          </Show>
        </section>
        <section class="approval-panel" data-testid="approval-panel">
          <h2>Approval</h2>
          <For each={proposedChanges.data ?? []}>
            {change => (
              <ApprovalCard
                change={change}
                sourceRefs={latestTaskSourceRefs()}
                onAccept={() => void acceptChange(change.id)}
                onReject={() => void rejectChange(change.id)}
              />
            )}
          </For>
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
    <article class="approval-card" data-testid="approval-card">
      <div class="approval-card-header">
        <div>
          <strong>{props.change.diff[0]?.title ?? props.change.id}</strong>
          <small>{props.change.id}</small>
        </div>
        <span class="status-pill">{props.change.approvalState}</span>
      </div>
      <div class="approval-meta" data-testid="approval-metadata">
        <span>Mode: {props.change.mode}</span>
        <span>Metadata: {props.change.metadataImpact}</span>
        <span>Graph: {props.change.graphImpact}</span>
        <span>Targets: {props.change.targetNoteIds.join(', ')}</span>
        <span>Base: {formatRecordMap(props.change.baseRevisions)}</span>
        <span>Provenance: {props.change.provenance}</span>
      </div>
      <Show when={props.sourceRefs.length > 0}>
        <div class="source-ref-list">
          <For each={props.sourceRefs}>
            {source => (
              <span class="source-ref-chip" data-testid="source-ref-chip">
                {source.label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <For each={props.change.diff}>
        {diff => (
          <div class="diff-grid">
            <section class="diff-pane">
              <h3>Before</h3>
              <pre>{diff.before}</pre>
            </section>
            <section class="diff-pane">
              <h3>After</h3>
              <pre>{diff.after}</pre>
            </section>
          </div>
        )}
      </For>
      <Show when={props.change.approvalState === 'pending'}>
        <div class="approval-actions">
          <button data-testid="accept-proposed-change" type="button" onClick={props.onAccept}>
            <Check size={14} />
            Accept
          </button>
          <button type="button" onClick={props.onReject}>
            Reject
          </button>
        </div>
      </Show>
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
