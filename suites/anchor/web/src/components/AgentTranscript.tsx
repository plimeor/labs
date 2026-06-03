import { For, Show } from 'solid-js'

import {
  type AgentTurn,
  type AssistantTurn,
  deriveTurnPhase,
  groupAgentMessagesByTurn,
  permissionModeConfig
} from '../domain/agent-session'
import type { AgentOutput, AgentTask, PermissionMode, SourceRef, TaskContext } from '../domain/types'

interface AgentTranscriptProps {
  onModeChange: (mode: PermissionMode) => void
  task: AgentTask
}

const permissionModes: PermissionMode[] = ['safe', 'ask', 'allow-all']

export function AgentTranscript(props: AgentTranscriptProps) {
  const turns = () => groupAgentMessagesByTurn(props.task.messages, false)

  return (
    <div class="agent-session" data-testid="agent-transcript">
      <section class="task-overview" data-testid="agent-task-overview">
        <div>
          <strong>{props.task.title}</strong>
          <small>{props.task.id}</small>
        </div>
        <div class="task-meta-grid">
          <span>Mode: {props.task.mode}</span>
          <span>Scope: {formatScope(props.task.context)}</span>
          <span>Permission: {permissionModeConfig[props.task.permissionModeState.permissionMode].displayName}</span>
          <span>Mode version: {props.task.permissionModeState.modeVersion}</span>
        </div>
        <Show when={props.task.context.explicitSources.length > 0}>
          <div class="source-ref-list">
            <For each={props.task.context.explicitSources}>{source => <SourceRefChip sourceRef={source} />}</For>
          </div>
        </Show>
        <Show when={props.task.outputs.length > 0}>
          <div class="output-list">
            <For each={props.task.outputs}>{output => <AgentOutputRow output={output} />}</For>
          </div>
        </Show>
        <Show when={props.task.timeline.length > 0}>
          <div class="timeline-list">
            <For each={props.task.timeline}>
              {event => (
                <div class="timeline-row">
                  <span>{event.type}</span>
                  <small>{event.detail}</small>
                </div>
              )}
            </For>
          </div>
        </Show>
      </section>
      <div class="agent-mode-row">
        <For each={permissionModes}>
          {mode => (
            <button
              type="button"
              class={props.task.permissionModeState.permissionMode === mode ? 'active' : ''}
              onClick={() => props.onModeChange(mode)}
            >
              {permissionModeConfig[mode].shortName}
            </button>
          )}
        </For>
      </div>

      <For each={turns()}>
        {turn => (
          <Show when={isAssistantTurn(turn) ? turn : false} fallback={<NonAssistantTurn turn={turn} />}>
            {assistantTurn => <AssistantTurnView turn={assistantTurn()} />}
          </Show>
        )}
      </For>
    </div>
  )
}

function isAssistantTurn(turn: AgentTurn): turn is AssistantTurn {
  return turn.type === 'assistant'
}

function AssistantTurnView(props: { turn: AssistantTurn }) {
  return (
    <article class="turn assistant">
      <div class="turn-header">
        <span>{deriveTurnPhase(props.turn)}</span>
        <span>{props.turn.activities.length} activities</span>
      </div>
      <div class="turn-meta">
        <span>Turn {props.turn.turnId}</span>
        <small>{props.turn.isComplete ? 'complete' : 'open'}</small>
      </div>
      <For each={props.turn.activities}>
        {activity => (
          <div
            class={`activity ${activity.type} ${activity.status}`}
            style={{ 'margin-left': `${activity.depth * 16}px` }}
          >
            <div class="activity-title">
              <span>{activity.displayName ?? activity.toolName ?? activity.type}</span>
              <span>{activity.status}</span>
            </div>
            <div class="activity-meta">
              <span>{activity.type}</span>
              <Show when={activity.toolUseId}>
                <span>toolUseId: {activity.toolUseId}</span>
              </Show>
              <Show when={activity.parentId}>
                <span>parent: {activity.parentId}</span>
              </Show>
            </div>
            <Show when={activity.toolIntent}>
              <p class="activity-intent">{activity.toolIntent}</p>
            </Show>
            <Show when={activity.permissionRequest}>
              {permissionRequest => (
                <div class="permission-card">
                  <div>
                    <strong>{permissionRequest().toolName}</strong>
                    <span>{permissionRequest().status}</span>
                  </div>
                  <p>{permissionRequest().description}</p>
                  <Show when={permissionRequest().reason}>
                    <small>Reason: {permissionRequest().reason}</small>
                  </Show>
                  <Show when={permissionRequest().impact}>
                    <small>Impact: {permissionRequest().impact}</small>
                  </Show>
                  <Show when={permissionRequest().command}>
                    <code>{permissionRequest().command}</code>
                  </Show>
                </div>
              )}
            </Show>
            <Show when={hasObjectKeys(activity.toolInput)}>
              <details class="activity-details">
                <summary>Input</summary>
                <pre>{formatJson(activity.toolInput)}</pre>
              </details>
            </Show>
            <Show when={activity.toolResult}>
              <details class="activity-details">
                <summary>Result</summary>
                <pre>{activity.toolResult}</pre>
              </details>
            </Show>
            <Show when={activity.content}>
              <pre>{activity.content}</pre>
            </Show>
          </div>
        )}
      </For>
      <Show when={props.turn.response}>{response => <div class="assistant-response">{response().text}</div>}</Show>
    </article>
  )
}

function NonAssistantTurn(props: { turn: AgentTurn }) {
  const isUserOrSystem = () => props.turn.type === 'user' || props.turn.type === 'system'
  return (
    <div class={`turn ${props.turn.type}`}>
      <div class="turn-meta">
        <span>{props.turn.type}</span>
        <small>{isUserOrSystem() && props.turn.type !== 'assistant' ? props.turn.message.id : ''}</small>
      </div>
      <p>{isUserOrSystem() && props.turn.type !== 'assistant' ? props.turn.message.content : ''}</p>
    </div>
  )
}

function AgentOutputRow(props: { output: AgentOutput }) {
  return (
    <Show
      when={props.output.kind === 'draft'}
      fallback={
        <Show
          when={props.output.kind === 'reference' ? props.output : false}
          fallback={
            <Show
              when={props.output.kind === 'proposal'}
              fallback={
                <div class="output-row">
                  <span>Proposed Change</span>
                  <strong>{props.output.title}</strong>
                  <small>{props.output.kind === 'proposed_change' ? props.output.proposedChangeId : ''}</small>
                </div>
              }
            >
              <div class="output-row">
                <span>Proposal</span>
                <strong>{props.output.title}</strong>
              </div>
            </Show>
          }
        >
          {referenceOutput => (
            <div class="output-row">
              <span>Reference</span>
              <strong>{referenceOutput().title}</strong>
              <div class="source-ref-list">
                <For each={referenceOutput().sourceRefs}>{source => <SourceRefChip sourceRef={source} />}</For>
              </div>
            </div>
          )}
        </Show>
      }
    >
      <div class="output-row">
        <span>Draft</span>
        <strong>{props.output.title}</strong>
      </div>
    </Show>
  )
}

function SourceRefChip(props: { sourceRef: SourceRef }) {
  return (
    <span class="source-ref-chip" data-testid="source-ref-chip">
      {props.sourceRef.label}
      <Show when={props.sourceRef.noteId}>
        <small>{props.sourceRef.noteId}</small>
      </Show>
    </span>
  )
}

function formatScope(context: TaskContext): string {
  const { scope } = context
  if (scope.kind === 'none') {
    return 'none'
  }
  if (scope.value) {
    return `${scope.kind}:${scope.value}`
  }
  if (context.targetNoteId) {
    return `${scope.kind}:${context.targetNoteId}`
  }
  return scope.kind
}

function hasObjectKeys(value: Record<string, unknown> | undefined): boolean {
  return Object.keys(value ?? {}).length > 0
}

function formatJson(value: Record<string, unknown> | undefined): string {
  return JSON.stringify(value ?? {}, null, 2)
}
