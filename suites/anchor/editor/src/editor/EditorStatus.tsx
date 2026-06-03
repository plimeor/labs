import { Show } from 'solid-js'

import type { SaveStatus } from '../autosave-controller'
import { statusLabel } from '../autosave-controller'

interface EditorStatusProps {
  status: SaveStatus
}

export function EditorStatus(props: EditorStatusProps) {
  const isProblem = () => props.status === 'conflict' || props.status === 'failed'

  return (
    <Show when={isProblem()}>
      <div class="mx-auto flex min-h-[38px] w-full max-w-[720px] shrink-0 justify-start px-10 pb-1 pt-2.5">
        <span
          class="inline-flex min-h-6 items-center rounded-full bg-[var(--feedback-warning-bg)] px-2 text-xs text-[var(--feedback-warning)]"
          data-testid="round-trip-status"
        >
          {statusLabel(props.status)}
        </span>
      </div>
    </Show>
  )
}
