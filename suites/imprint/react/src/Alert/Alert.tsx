import { CheckCheck, Info, type LucideIcon, OctagonAlert, TriangleAlert } from 'lucide-react'
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'

export type AlertKind = 'info' | 'success' | 'warning' | 'danger'

/** Default leading glyph per kind, matching the specimen. */
const KIND_ICON: Record<AlertKind, LucideIcon> = {
  danger: OctagonAlert,
  info: Info,
  success: CheckCheck,
  warning: TriangleAlert
}

// One tv() with a slot per part. The `kind` variant only retints the root
// (background + foreground); the tinted fg is inherited by title/description.
// Named utilities (bg-accent-subtle, text-success, …) emit the same
// var(--token) the old CSS Module used; the icon's optical margin and the
// 16px glyph box use the arbitrary form for byte-identical output.
const alert = tv({
  defaultVariants: { kind: 'info' },
  slots: {
    content: 'flex flex-col gap-1 min-w-0',
    description: 'font-normal opacity-85',
    icon: 'size-[16px] shrink-0 mt-[calc((1em*var(--leading-snug)-16px)/2)]',
    title: 'font-medium',
    root: [
      'flex items-start gap-2 py-2 px-3',
      'rounded-sm font-ui text-sm font-medium leading-snug',
      'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
    ]
  },
  variants: {
    kind: {
      danger: { root: 'bg-danger-bg text-danger' },
      info: { root: 'bg-accent-subtle text-accent-fg' },
      success: { root: 'bg-success-bg text-success' },
      warning: { root: 'bg-warning-bg text-warning' }
    }
  }
})

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Status the banner communicates. Drives the tint and the leading glyph. */
  kind?: AlertKind
  /** Primary message. */
  title: ReactNode
  /** Optional supporting copy rendered under the title. */
  description?: ReactNode
  /** Override the leading icon. Defaults to the kind's glyph. */
  icon?: LucideIcon
  children?: ReactNode
}

/**
 * Imprint Alert. A static, inline status banner: a leading lucide glyph on a
 * tinted fill with a title and optional description — 1:1 with the Imprint
 * specimen (no colored left rail). The visual status is exposed via
 * `data-kind` for token-driven styling.
 *
 * Defaults to `role="status"` (polite); the `danger` kind defaults to
 * `role="alert"` (assertive). Either can be overridden via `role`.
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { kind = 'info', title, description, icon, role, className, children, ...rest },
  ref
) {
  const Icon = icon ?? KIND_ICON[kind]
  const resolvedRole = role ?? (kind === 'danger' ? 'alert' : 'status')
  const styles = alert({ kind })

  return (
    <div ref={ref} role={resolvedRole} data-kind={kind} className={styles.root({ className })} {...rest}>
      <Icon className={styles.icon()} aria-hidden="true" />
      <div className={styles.content()}>
        <span className={styles.title()}>{title}</span>
        {description ? <span className={styles.description()}>{description}</span> : null}
        {children}
      </div>
    </div>
  )
})
