import type { SaveStatus } from '../autosave-controller'
import { statusLabel } from '../autosave-controller'

interface EditorStatusProps {
  status: SaveStatus
}

export function EditorStatus(props: EditorStatusProps) {
  const isProblem = props.status === 'conflict' || props.status === 'failed'

  return isProblem ? (
    <div className="mx-auto flex min-h-[38px] w-full max-w-[720px] shrink-0 justify-start px-10 pt-2.5 pb-1">
      <span
        className="inline-flex min-h-6 items-center rounded-full bg-[var(--feedback-warning-bg)] px-2 text-[var(--feedback-warning)] text-xs"
        data-testid="round-trip-status"
      >
        {statusLabel(props.status)}
      </span>
    </div>
  ) : null
}
