import { useQuery } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import { For } from 'solid-js'

import type { OperationRecord } from '../domain/types'
import { useAnchor } from '../lib/anchor-context'
import { formatRecordMap } from './-shared'

export const Route = createFileRoute('/settings')({
  component: SettingsRoute
})

function SettingsRoute() {
  const anchor = useAnchor()
  const diagnostics = useQuery(() => ({
    queryKey: ['diagnostics', anchor.vaultRevision()],
    queryFn: () => anchor.backend.diagnostics()
  }))
  const operations = useQuery(() => ({
    queryKey: ['operations', anchor.vaultRevision()],
    queryFn: () => anchor.backend.listOperationRecords()
  }))

  return (
    <div class="route-stack" data-testid="settings-route">
      <header class="route-header">
        <div>
          <p>Settings</p>
          <h1>Diagnostics and operation records</h1>
        </div>
      </header>
      <section class="diagnostics-card">
        <pre>{JSON.stringify(diagnostics.data, null, 2)}</pre>
      </section>
      <section class="operation-list">
        <For each={operations.data ?? []}>{operation => <OperationRecordRow operation={operation} />}</For>
      </section>
    </div>
  )
}

function OperationRecordRow(props: { operation: OperationRecord }) {
  return (
    <article class="operation-row">
      <div>
        <strong>{props.operation.operationType}</strong>
        <small>{props.operation.id}</small>
      </div>
      <span>
        {props.operation.actorType} / {props.operation.mode}
      </span>
      <span>{props.operation.approvalState}</span>
      <div class="operation-details">
        <span>Targets: {props.operation.targetNoteIds.join(', ') || 'none'}</span>
        <span>Base: {formatRecordMap(props.operation.baseRevisions)}</span>
        <span>Result: {formatRecordMap(props.operation.resultingRevisions)}</span>
        <span>Graph: {props.operation.graphImpactSummary}</span>
        <span>Provenance: {props.operation.provenance}</span>
      </div>
    </article>
  )
}
