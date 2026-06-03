import {
  type AgentTurn,
  type AssistantTurn,
  deriveTurnPhase,
  groupAgentMessagesByTurn,
  permissionModeConfig,
  type SystemTurn,
  type UserTurn
} from '../domain/agent-session'
import type { AgentOutput, AgentTask, PermissionMode, SourceRef, TaskContext } from '../domain/types'

interface AgentTranscriptProps {
  onModeChange: (mode: PermissionMode) => void
  task: AgentTask
}

const permissionModes: PermissionMode[] = ['safe', 'ask', 'allow-all']

export function AgentTranscript(props: AgentTranscriptProps) {
  const turns = groupAgentMessagesByTurn(props.task.messages, false)

  return (
    <div className="agent-session" data-testid="agent-transcript">
      <section className="task-overview" data-testid="agent-task-overview">
        <div>
          <strong>{props.task.title}</strong>
          <small>{props.task.id}</small>
        </div>
        <div className="task-meta-grid">
          <span>Mode: {props.task.mode}</span>
          <span>Scope: {formatScope(props.task.context)}</span>
          <span>Permission: {permissionModeConfig[props.task.permissionModeState.permissionMode].displayName}</span>
          <span>Mode version: {props.task.permissionModeState.modeVersion}</span>
        </div>
        {props.task.context.explicitSources.length > 0 ? (
          <div className="source-ref-list">
            {props.task.context.explicitSources.map(source => (
              <SourceRefChip key={source.label} sourceRef={source} />
            ))}
          </div>
        ) : null}
        {props.task.outputs.length > 0 ? (
          <div className="output-list">
            {props.task.outputs.map(output => (
              <AgentOutputRow key={output.id} output={output} />
            ))}
          </div>
        ) : null}
        {props.task.timeline.length > 0 ? (
          <div className="timeline-list">
            {props.task.timeline.map(event => (
              <div className="timeline-row" key={event.id}>
                <span>{event.type}</span>
                <small>{event.detail}</small>
              </div>
            ))}
          </div>
        ) : null}
      </section>
      <div className="agent-mode-row">
        {permissionModes.map(mode => (
          <button
            key={mode}
            type="button"
            className={props.task.permissionModeState.permissionMode === mode ? 'active' : ''}
            onClick={() => props.onModeChange(mode)}
          >
            {permissionModeConfig[mode].shortName}
          </button>
        ))}
      </div>

      {turns.map(turn => (
        <TurnView key={turnKey(turn)} turn={turn} />
      ))}
    </div>
  )
}

function turnKey(turn: AgentTurn): string {
  if (turn.type === 'assistant') {
    return turn.turnId
  }

  return turn.message.id
}

function TurnView(props: { turn: AgentTurn }) {
  if (props.turn.type === 'assistant') {
    return <AssistantTurnView turn={props.turn} />
  }

  return <NonAssistantTurn turn={props.turn} />
}

function AssistantTurnView(props: { turn: AssistantTurn }) {
  const { response } = props.turn

  return (
    <article className="turn assistant">
      <div className="turn-header">
        <span>{deriveTurnPhase(props.turn)}</span>
        <span>{props.turn.activities.length} activities</span>
      </div>
      <div className="turn-meta">
        <span>Turn {props.turn.turnId}</span>
        <small>{props.turn.isComplete ? 'complete' : 'open'}</small>
      </div>
      {props.turn.activities.map(activity => {
        const { permissionRequest } = activity

        return (
          <div
            key={activity.id}
            className={`activity ${activity.type} ${activity.status}`}
            style={{ marginLeft: `${activity.depth * 16}px` }}
          >
            <div className="activity-title">
              <span>{activity.displayName ?? activity.toolName ?? activity.type}</span>
              <span>{activity.status}</span>
            </div>
            <div className="activity-meta">
              <span>{activity.type}</span>
              {activity.toolUseId ? <span>toolUseId: {activity.toolUseId}</span> : null}
              {activity.parentId ? <span>parent: {activity.parentId}</span> : null}
            </div>
            {activity.toolIntent ? <p className="activity-intent">{activity.toolIntent}</p> : null}
            {permissionRequest ? (
              <div className="permission-card">
                <div>
                  <strong>{permissionRequest.toolName}</strong>
                  <span>{permissionRequest.status}</span>
                </div>
                <p>{permissionRequest.description}</p>
                {permissionRequest.reason ? <small>Reason: {permissionRequest.reason}</small> : null}
                {permissionRequest.impact ? <small>Impact: {permissionRequest.impact}</small> : null}
                {permissionRequest.command ? <code>{permissionRequest.command}</code> : null}
              </div>
            ) : null}
            {hasObjectKeys(activity.toolInput) ? (
              <details className="activity-details">
                <summary>Input</summary>
                <pre>{formatJson(activity.toolInput)}</pre>
              </details>
            ) : null}
            {activity.toolResult ? (
              <details className="activity-details">
                <summary>Result</summary>
                <pre>{activity.toolResult}</pre>
              </details>
            ) : null}
            {activity.content ? <pre>{activity.content}</pre> : null}
          </div>
        )
      })}
      {response ? <div className="assistant-response">{response.text}</div> : null}
    </article>
  )
}

function NonAssistantTurn(props: { turn: UserTurn | SystemTurn }) {
  return (
    <div className={`turn ${props.turn.type}`}>
      <div className="turn-meta">
        <span>{props.turn.type}</span>
        <small>{props.turn.message.id}</small>
      </div>
      <p>{props.turn.message.content}</p>
    </div>
  )
}

function AgentOutputRow(props: { output: AgentOutput }) {
  const { output } = props

  if (output.kind === 'draft') {
    return (
      <div className="output-row">
        <span>Draft</span>
        <strong>{output.title}</strong>
      </div>
    )
  }

  if (output.kind === 'reference') {
    return (
      <div className="output-row">
        <span>Reference</span>
        <strong>{output.title}</strong>
        <div className="source-ref-list">
          {output.sourceRefs.map(source => (
            <SourceRefChip key={source.label} sourceRef={source} />
          ))}
        </div>
      </div>
    )
  }

  if (output.kind === 'proposal') {
    return (
      <div className="output-row">
        <span>Proposal</span>
        <strong>{output.title}</strong>
      </div>
    )
  }

  return (
    <div className="output-row">
      <span>Proposed Change</span>
      <strong>{output.title}</strong>
      <small>{output.proposedChangeId}</small>
    </div>
  )
}

function SourceRefChip(props: { sourceRef: SourceRef }) {
  return (
    <span className="source-ref-chip" data-testid="source-ref-chip">
      {props.sourceRef.label}
      {props.sourceRef.noteId ? <small>{props.sourceRef.noteId}</small> : null}
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
