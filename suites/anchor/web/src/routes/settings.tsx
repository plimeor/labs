import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

import type { OperationRecord } from '../domain/types'
import { useAnchor } from '../lib/anchor-context'
import { formatRecordMap } from './-shared'

export const Route = createFileRoute('/settings')({
  component: SettingsRoute
})

function SettingsRoute() {
  const anchor = useAnchor()
  const diagnostics = useQuery({
    queryKey: ['diagnostics', anchor.vaultRevision],
    queryFn: () => anchor.backend.diagnostics()
  })
  const operations = useQuery({
    queryKey: ['operations', anchor.vaultRevision],
    queryFn: () => anchor.backend.listOperationRecords()
  })

  return (
    <div className="route-stack" data-testid="settings-route">
      <header className="route-header">
        <div>
          <p>Settings</p>
          <h1>Diagnostics and operation records</h1>
        </div>
      </header>
      <section className="diagnostics-card">
        <pre>{JSON.stringify(diagnostics.data, null, 2)}</pre>
      </section>
      <section className="operation-list">
        {(operations.data ?? []).map(operation => (
          <OperationRecordRow key={operation.id} operation={operation} />
        ))}
      </section>
    </div>
  )
}

function OperationRecordRow(props: { operation: OperationRecord }) {
  return (
    <article className="operation-row">
      <div>
        <strong>{props.operation.operationType}</strong>
        <small>{props.operation.id}</small>
      </div>
      <span>
        {props.operation.actorType} / {props.operation.mode}
      </span>
      <span>{props.operation.approvalState}</span>
      <div className="operation-details">
        <span>Targets: {props.operation.targetNoteIds.join(', ') || 'none'}</span>
        <span>Base: {formatRecordMap(props.operation.baseRevisions)}</span>
        <span>Result: {formatRecordMap(props.operation.resultingRevisions)}</span>
        <span>Graph: {props.operation.graphImpactSummary}</span>
        <span>Provenance: {props.operation.provenance}</span>
      </div>
    </article>
  )
}
